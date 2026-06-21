# V2 Product Spec: Wholesale / MGA Radar

**Target ICP Pivot:** Wholesale Brokers, Managing General Agents (MGAs), and Surplus Lines Brokers.

## The Strategic Thesis
In V1, we built AgencyForte for **Retail Principals** to attack competitors and steal market share. 

In V2, we unlock an entirely new revenue stream by selling to **Wholesalers**. Wholesalers do not sell directly to the public; they rely on retail agencies to feed them business. Their biggest struggle is identifying which retail agencies *actually need* their help. 

When a retail agency loses standard direct markets (like Travelers, State Farm, or Chubb), they are mathematically forced to use Wholesalers to place their clients' risks. By tracking carrier terminations, we can feed a real-time list of "desperate" retail agencies directly to Wholesale brokers.

## Core Features & Mechanics

### 1. The "Wholesale Dependency" Score
Instead of looking at distress from the perspective of an acquisition, we calculate dependency. 
- We look at the `agency_carrier_appointments` table.
- If an agency has 0 or 1 standard direct markets remaining, their **Wholesale Dependency Score** hits 100%. They are prime targets for a Wholesaler pitch.

### 2. The Orphaned Agency Feed (Real-Time Leads)
Similar to the Market Sniper, this feed alerts Wholesalers the second a retail agency loses a carrier. 
- **The Pitch:** "Hey Smith Agency, I saw you just lost your Travelers Commercial contract. If you have commercial clients you still need to place, my MGA can give you access to 5 commercial markets today."

### 3. Line of Business (LOB) Routing
Wholesalers usually specialize in either Commercial Lines or Personal Lines.
- If we detect a termination from a Commercial carrier (e.g., Liberty Mutual Commercial), we flag that agency as a hot lead for Commercial Wholesalers.
- If we detect a termination from a Personal Lines carrier (e.g., Safeco Auto), we flag them for Personal Lines MGAs.

### 4. CRM Integration (Export)
Wholesalers run massive sales teams. V2 should include an export function (CSV or direct API integration to Salesforce/HubSpot) so they can dump these highly qualified leads directly into their outbound calling campaigns.

## Why this is a massive V2 Opportunity
Wholesalers generally have much larger software and data budgets than independent retail agencies. A retail principal might pay $200/mo for AgencyForte, but a National MGA would easily pay $2,000+/mo for a real-time feed of orphaned retail agencies.
