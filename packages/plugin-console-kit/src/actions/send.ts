import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    Handler,
    composeContext,
    ModelClass,
    generateObject,
    Content,
} from "@elizaos/core";
import { ConsoleKitService } from "../services/console";
import { z } from "zod";
import { isAddress } from "viem";

import fetch from "node-fetch";

async function getTokenAddress(tokenSymbol: string, chain: string | number) {
    const chainMap = {
        ethereum: "ethereum",
        bsc: "binance-smart-chain",
        polygon: "polygon-pos",
        solana: "solana",
        avalanche: "avalanche",
        arbitrum: "arbitrum-one",
        optimism: "optimistic-ethereum",
        fantom: "fantom",
    };

    const chainMapID = {
        1: "ethereum",
    };

    const apiUrl = `https://api.coingecko.com/api/v3/coins/list`;
    const response = await fetch(apiUrl);
    const tokens = await response.json();

    const token = tokens.find(
        (t: any) => t.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    );
    if (!token) {
        console.log("Token not found.");
        return null;
    }

    const tokenDetailsUrl = `https://api.coingecko.com/api/v3/coins/${token.id}`;
    const detailsResponse = await fetch(tokenDetailsUrl);
    const details = await detailsResponse.json();
    const isChainId =
        typeof chain === "number" ? true : Number(chain) ? true : false;
    return (
        details.platforms[
            isChainId ? chainMapID[Number(chain)] : chainMap[Number(chain)]
        ] || "Address not available for this chain."
    );
}

const transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "accountAddress": "<TOKEN_ADDRESS>",
    "receiverAddress": "<TOKEN_ADDRESS>",
    "transferAmount": "1000",
    "tokenAddress": "USDC"
    "chainId":1
}
\`\`\`

User message:
"{{currentMessage}}"

Given the message, extract the following information about the requested token transfer:
- Account contract address that sendinf the token
- Receiver wallet address
- Transfer amount
- The symbol of the token that wants to be transferred.
- Chain id

Respond with a JSON markdown block containing only the extracted values.`;

export interface TransferContent extends Content {
    accountAddress: string;
    receiverAddress: string;
    transferAmount: string | number;
    tokenAddress?: string;
    chainId: number;
}

const TransferSchema = z.object({
    accountAddress: z.string().optional(),
    receiverAddress: z.string(),
    transferAmount: z.string(),
    chainId: z.number(),
    tokenAddress: z.string().optional(),
});

const validatedTransferSchema = z.object({
    accountAddress: z
        .string()
        .refine(isAddress, { message: "Invalid token address" }),
    receiverAddress: z
        .string()
        .refine(isAddress, { message: "Invalid recipient address" }),
    transferAmount: z.string(),
});

export const sendAction: Action = {
    name: "SEND_TOKEN",
    description: "Send tokens to an address",
    similes: [
        "transfer token",
        "send tokens",
        "transfer to address",
        "send to wallet",
        "send crypto",
        "transfer cryptocurrency",
    ],
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime) => {
        console.log(
            "runtime.getSetting('CONSOLE_KIT_API_KEY')---",
            runtime.getSetting("CONSOLE_KIT_API_KEY")
        );
        return !!runtime.getSetting("CONSOLE_KIT_API_KEY");
    },
    handler: (async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: Record<string, unknown> | undefined,
        callback: HandlerCallback
    ) => {
        // console.log("message----", message);
        console.log("state----", state);
        console.log("options----", options);

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        state.currentMessage = `${state.recentMessagesData[1].content.text}`;
        const transferContext = composeContext({
            state,
            template: transferTemplate,
        });

        const content = (
            await generateObject({
                runtime,
                context: transferContext,
                modelClass: ModelClass.LARGE,
                schema: TransferSchema,
            })
        ).object as TransferContent;

        console.log("content----", content);

        try {
            if (!options) {
                throw new Error("No options provided");
            }

            const params = {
                chainId: options.chainId as number,
                receiverAddress: options.receiverAddress as string,
                transferAmount: options.transferAmount as string,
                accountAddress: options.accountAddress as string,
                tokenAddress: options.tokenAddress as string,
            };

            const service = runtime.services.get(ConsoleKitService.serviceType);
            if (!(service instanceof ConsoleKitService)) {
                throw new Error("ConsoleKit service not found or invalid");
            }

            const result = await service.send(params);

            callback({
                text: `✅ Transaction prepared successfully!\nTransactions to execute:\n${JSON.stringify(
                    result.data.transactions,
                    null,
                    2
                )}`,
                content: { transactions: result.data.transactions },
            });
            return true;
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            elizaLogger.error("Send token failed:", errorMessage);
            callback({
                text: `❌ Failed to send tokens: ${errorMessage}`,
                content: { error: errorMessage },
            });
            return false;
        }
    }) as Handler,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 100 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you send 100 USDC. Let me prepare the transaction.",
                    action: "SEND_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 5 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on Ethereum mainnet",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you transfer 5 ETH on Ethereum mainnet. Let me prepare the transaction.",
                    action: "SEND_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 1000 DAI to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on Polygon",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you send 1000 DAI on Polygon. Let me prepare the transaction.",
                    action: "SEND_TOKEN",
                },
            },
        ],
    ],
};
