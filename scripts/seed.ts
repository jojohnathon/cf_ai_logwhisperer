import fs from "node:fs";

interface PatternSeed {
  id: string;
  title: string;
  vendor: string;
  signature: string;
  guidance: string;
}

const seeds: PatternSeed[] = [
  {
    id: "dhcpdecline-mdns",
    title: "DHCPDECLINE storm after rogue server",
    vendor: "linux",
    signature: "DHCPDECLINE .* no binding",
    guidance: "Indicates client rejecting offers; investigate rogue DHCP, clear leases, or restart NetworkManager."
  },
  {
    id: "ufw-mdns",
    title: "UFW blocked 5353 mDNS multicast",
    vendor: "linux",
    signature: "IN=.*OUT=.*PROTO=UDP.*DPT=5353",
    guidance: "Allow UDP/5353 for multicast DNS where appropriate or constrain to trusted subnets."
  },
  {
    id: "asa-106023",
    title: "ASA %ASA-4-106023 Deny",
    vendor: "cisco",
    signature: "%ASA-4-106023",
    guidance: "Access-list dropping flow; adjust outside-in ACL or confirm intended block."
  }
];

function buildPayload(seed: PatternSeed) {
  return {
    id: seed.id,
    values: [seed.guidance],
    metadata: {
      title: seed.title,
      vendor: seed.vendor,
      signature: seed.signature,
      guidance: seed.guidance
    }
  };
}

async function main() {
  if (!process.env.VECTORIZE_ACCOUNT || !process.env.VECTORIZE_INDEX) {
    console.log("VECTORIZE_ACCOUNT or VECTORIZE_INDEX not set. Printing payload for manual import.");
    const payload = seeds.map(buildPayload);
    fs.writeFileSync("vectorize_seed.json", JSON.stringify(payload, null, 2));
    console.log("Wrote vectorize_seed.json");
    return;
  }

  const account = process.env.VECTORIZE_ACCOUNT;
  const index = process.env.VECTORIZE_INDEX;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!apiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is required for direct seeding.");
  }

  for (const seed of seeds) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/vectorize/indexes/${index}/upsert`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vectors: [buildPayload(seed)]
        })
      }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to seed ${seed.id}: ${response.status} ${text}`);
    }
    console.log(`Seeded pattern ${seed.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
