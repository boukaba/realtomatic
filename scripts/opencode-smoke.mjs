import { createOpencodeServer } from "@opencode-ai/sdk/server";
import { createOpencodeClient } from "@opencode-ai/sdk/client";

const server = await createOpencodeServer({ port: 40000 + Math.floor(Math.random() * 10000) });
console.log("server url:", server.url);

const client = createOpencodeClient({ baseUrl: server.url, throwOnError: true });

const session = await client.session.create({ body: { title: "smoke-test" } });
console.log("session:", session.data.id);

const t0 = Date.now();
const result = await client.session.prompt({
  path: { id: session.data.id },
  body: {
    model: { providerID: "opencode", modelID: "ling-3.1-flash-free" },
    system:
      "You are a real estate market data synthesizer. Always answer with a single valid JSON object and nothing else.",
    parts: [
      {
        type: "text",
        text: 'Generate one realistic commercial real estate market snapshot for Austin, TX. JSON shape: {"city":string,"state":string,"medianRentPerSqFt":number,"vacancyRate":number,"yoyGrowth":number,"topTenant":string}. Numbers must be plausible (vacancyRate 0-25).',
      },
    ],
  },
});

const text = result.data.parts
  .filter((p) => p.type === "text")
  .map((p) => p.text)
  .join("");
console.log("latency ms:", Date.now() - t0);
console.log("cost:", result.data.info.cost, "tokens:", result.data.info.tokens);
console.log("text:", text);

server.close();
