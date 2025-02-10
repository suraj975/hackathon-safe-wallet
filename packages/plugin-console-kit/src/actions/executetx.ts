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
import { initWalletProvider, type WalletProvider } from "../providers/wallet";

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

const executeTxTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "transactionHash": "<TRANSACTION_HASH>",
    "url": "https://<BLOCKEXPLORER_LINK>/tx/<TRANSACTION_HASH>",
    "chainId":1
}
\`\`\`

User message:
"{{currentMessage}}"

Given the message, extract the following information about the transaction:
- Transaction hash
- Chain Id
- Block explorer link to view the transaction the block explorer based on chaind Id

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

export const executeTxAction: Action = {
    name: "EXECUTE_TX",
    description: "Execute a transaction via an eoa",
    similes: [
        "execute transaction",
        "send transaction",
        "initiate transaction",
        "send transaction via eoa",
    ],
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime) => {
        return !!runtime.getSetting("CONSOLE_KIT_API_KEY");
    },
    handler: (async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: Record<string, unknown> | undefined,
        callback: HandlerCallback
    ) => {
        console.log("message----", message);
        
        console.log("options----", options);

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        state.currentMessage = `${state.recentMessagesData[1].content.text}`;
        console.log('state...',JSON.stringify(state));
        
        // const transferContext = composeContext({
        //     state,
        //     template: executeTxTemplate,
        // });

        // const content = (
        //     await generateObject({
        //         runtime,
        //         context: transferContext,
        //         modelClass: ModelClass.LARGE,
        //         schema: TransferSchema,
        //     })
        // ).object as TransferContent;

        // console.log("content----", content);

        try {
            if (!options) {
                throw new Error("No options provided");
            }

            // const params = {
            //     chainId: options.chainId as number,
            //     receiverAddress: options.receiverAddress as string,
            //     transferAmount: options.transferAmount as string,
            //     accountAddress: options.accountAddress as string,
            //     tokenAddress: options.tokenAddress as string,
            // };

            // const service = runtime.services.get(ConsoleKitService.serviceType);
            // if (!(service instanceof ConsoleKitService)) {
            //     throw new Error("ConsoleKit service not found or invalid");
            // }

            // const result = await service.send(params);

            // console.log("result----", JSON.stringify(result));
            callback({
                text: `✅ Transaction executed successfully!`,
                // content: { transactions: result.data.transactions },
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
