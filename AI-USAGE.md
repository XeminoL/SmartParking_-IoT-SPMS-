# Generative AI Usage Disclosure

This disclosure is required by the SE252 project guidelines. It states, transparently, how generative AI was used, the scope of that use, and where the work was reviewed, corrected, and extended by the author.

## Tools used
- A large language model (assistant) was used interactively for research synthesis, drafting, and code generation.

## Scope of use

| Area | How AI was used | Author's own contribution / verification |
|---|---|---|
| **Domain research** | Prompted to gather and synthesize how real smart-parking systems, IoT sensor/MQTT stacks, CAS/SSO, and Vietnamese-gateway payment flows work, including web sources. | Author set the direction, selected which findings were relevant to HCMUT, and rejected the generic "Western car-park" framing in favour of the motorbike-dominated reality. |
| **Requirements (#1)** | Drafted the FR/NFR tables, use-case diagram, and stakeholder analysis from the synthesized research. | Author validated each requirement against the project brief, confirmed the ISO 25010 metrics are realistic, and set scope (reservation optional, BKPay stubbed). |
| **UML & UI (#2)** | Drafted use-case scenarios and the sequence/activity/state-chart diagrams and UI mockups. | Author checked diagram consistency against the requirements and the intended flows. |
| **Design (#3)** | Drafted the architecture, deployment view, class diagram, method descriptions, and test cases. | Author confirmed the component split, entity model, and design-pattern choices fit the requirements. |
| **MVP code** | Generated the single-file HTML/JS simulation (state model, simulation engine, RBAC views). | Author ran the code, found and fixed real defects (pricing-policy resolution picking the wrong tier; the simulation draining instead of filling so signage states never fired), and re-verified behaviour. |
| **PDF rendering** | Generated the Markdown-to-PDF tooling. | Author verified the diagrams render correctly in the output and fixed a Mermaid note-syntax error that broke one sequence diagram. |

## Level of contribution
AI was used as a drafting and research accelerator. Every artifact was reviewed against the source project description; requirements and design decisions were checked for realism and internal consistency; and the code was executed and debugged rather than accepted as written. The specific engineering judgments — motorbike-first flow, plate-bound anti-theft identity, treating HCMUT_SSO as CAS, stubbing BKPay, the count-based occupancy model, and the modular-monolith scope — were reviewed and owned by the author.

## What was NOT done by AI
- No claim in the documents is presented as a measured result; performance figures are stated as targets to validate.
- The demo screenshots are of the actual running MVP, not mock-ups.
