import fetch from "node-fetch";

type PatternSeed = {
  id: string;
  title: string;
  vendor: string;
  signature: string;
  guidance: string;
};

const patterns: PatternSeed[] = [
  {
    id: "dhcpdecline_mdsn",
    title: "DHCPDECLINE storm after rogue server",
    vendor: "linux",
    signature: "DHCPDECLINE .* no binding",
    guidance: "Clients repeatedly decline DHCP leases, usually due to conflicting offers or rogue DHCP servers. Investigate duplicate DHCP responders and clear stale leases."
  },
  {
    id: "ufw_mdns",
    title: "UFW blocked 5353 mDNS multicast",
    vendor: "linux",
    signature: "IN=.*OUT=.*PROTO=UDP.*DPT=5353",
    guidance: "UFW is blocking multicast DNS discovery. Allow UDP/5353 from the local subnet if mDNS is required."
  },
  {
    id: "asa_106023",
    title: "ASA %ASA-4-106023 Deny",
    vendor: "cisco",
    signature: "%ASA-4-106023",
    guidance: "Access list denies connection attempts. Confirm policy intent or add explicit permits for required services."
  }
];

async function main() {
  const endpoint = process.env.VECTORIZE_ENDPOINT;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!endpoint || !apiToken || !accountId) {
    console.warn("Missing VECTORIZE_ENDPOINT, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_ACCOUNT_ID. Printing payload instead.");
    console.log(JSON.stringify({ patterns }, null, 2));
    return;
  }

  for (const pattern of patterns) {
    const response = await fetch(`${endpoint}/accounts/${accountId}/vectorize/indexes/log_patterns/docs/${pattern.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: pattern.id,
        values: pattern.guidance,
        metadata: {
          title: pattern.title,
          vendor: pattern.vendor,
          signature: pattern.signature,
          guidance: pattern.guidance
        }
      })
    });

    if (!response.ok) {
      console.error(`Failed to upsert pattern ${pattern.id}`, await response.text());
    } else {
      console.log(`Seeded pattern ${pattern.id}`);
    }
  }
}

main().catch((error) => {
  console.error("Seed script failed", error);
  process.exitCode = 1;
});
