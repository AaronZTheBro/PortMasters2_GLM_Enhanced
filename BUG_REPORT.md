# PortMasters 2 defect report

November 21, 2026. Reviewed commit `553ce1a` with the existing local changes applied. The triage and reproduction notes describe that snapshot. Later fixes and audits are recorded below.

## Triage summary

The highest impact failures affect settlement progression, ownership of barter cargo, recovery of a saved voyage, tax settlement, and the accuracy of decisions about pirates and escorts. Broker’s Favor also breaks its payout cap when combined with eligible reward effects. The desktop phase scroller kept controls visible in the tested layouts. On the 667 by 375 landscape fixture, the Hold widget had only 16 pixels of visible content.

P1 means progress, cargo, Gold, or a core action can be lost or materially misrepresented. P2 means a common interaction, rule, or display is incorrect with a narrower consequence. P3 means misleading secondary information or an additional verification target. Engine evidence uses a local test fixture. Source evidence includes an actionable path with no claim of a browser reproduction.

## Progress, persistence, and shared harbor actions

### PM01 P1 Continue can forfeit unmatched barter cargo

**Evidence status.** Reproduced in Chromium with two captains. One posted an offer for one Hemp and both used the main Continue control. Both reached Artisan Management. The offer was never accepted and the poster’s inventory remained at nine Hemp from a starting ten. Ctrl+N takes the same transition. The common control runs `nextPhase`, which hands Barter an empty refund list. The phase specific button supplies open escrow from the barter hook. Once the room moves on, the server clears the board. Every path that advances from Barter should return each unmatched offer once. [Common action](src/components/portmasters/GameRoom.tsx#L895) [Generic transition](src/lib/game/engine/lifecycle.ts#L164) [Barter footer](src/components/portmasters/game/phases/BarterPhase.tsx) [Board cleanup](src/server/realtime.ts#L1361)

### PM02 P1 Barter changes cargo before the server confirms the outcome

**Evidence status.** Source verified. A post immediately removes cargo and a cancel immediately returns it. If the target leaves before a direct offer reaches the server, the server rejects the post and the client only displays its error. If acceptance races with cancellation, the client can refund a canceled offer even if the server has already awarded it. If the accepter’s inventory changes before the fulfillment event arrives, their client can reject the exchange after the seller has been credited. Verify normal actions with two captains and delayed responses. Each completed exchange must settle both sides once, and a rejected exchange must preserve ownership. [Barter actions](src/components/portmasters/game/phases/BarterPhase.tsx#L286) [Client event handling](src/lib/use%2Dbarter.ts#L48) [Current acceptance](src/server/barter.ts) [Server fulfillment](src/server/realtime.ts#L1776)

### PM03 P1 Reload while ready can strand a captain at an old phase

**Evidence status.** Reproduced in Chromium with two captains. Captain A votes ready and reloads before Captain B votes. In round 12, B and the server advanced to Barter while A remained in Buying. Readiness is stored on the server, but A’s transition callback only exists in a client ref. A can receive the advance after rejoining without a callback to run. A saved checkpoint also takes precedence on initial load, even when the room has advanced. Recovery should restore the phase and its committed choices without replaying or skipping cargo, production, or settlement. [Saved state load](src/lib/use%2Dgame%2Dsession.ts#L163) [Advance subscriber](src/lib/use%2Dphase%2Dsync.ts#L114) [Ready callback](src/lib/use%2Dphase%2Dsync.ts#L221) [Server readiness](src/server/realtime.ts#L1373)

### PM04 P1 Loading and autosave can replace progress or show Saved after a failure

**Evidence status.** Reproduced in Chromium with a temporary 503 on the save load. The stored fixture changed from round 12 Trade to round 1 In Harbor and the wallet became 100 Gold. With the PUT returning 503, the control still showed Saved. A time out takes the same fallback path. The client starts a fresh game without the room checkpoint, marks it dirty, and schedules a PUT. A successful PUT can overwrite the existing voyage. Also, a failed autosave clears the saving indicator and the controls render Saved. An older in flight response can clear the dirty flag for a newer change. Verify slow loads, rejected PUTs, overlapping writes, and a reload after each. A failed load must preserve the prior save and the save indicator must refer to the latest confirmed revision. [Load timeout](src/lib/use%2Dgame%2Dsession.ts#L134) [Failure fallback](src/lib/use%2Dgame%2Dsession.ts#L233) [Autosave](src/lib/use%2Dgame%2Dsession.ts#L305) [Saved status](src/components/portmasters/game/GameControlPanel.tsx#L167) [Save write](src/app/api/game/state/route.ts#L109)

### PM24 P1 The global Continue action in pirate waters can lock settlement for everyone

**Evidence status.** Reproduced in Chromium with two captains. Both clicked Continue to next phase while Pirate Waters was showing. The first release rolled the raid and opened bills for both captains. Both then voted to settle bills and remained waiting with the room and both saves still at round 12 Phase 3. The first release sets the server’s advancing flag and the pirate roll changes only a local flag. The server will clear advancing only on a newer phase rank. On this screen the global action should require a personal pirate decision before starting the single synchronized vote for bills. [Global control](src/components/portmasters/game/GameControlPanel.tsx#L119) [Settlement flow](src/components/portmasters/game/phases/Settlement.tsx#L382) [Generic transition](src/lib/game/engine/lifecycle.ts#L164) [Server release](src/server/realtime.ts#L329) [Server reset condition](src/server/realtime.ts#L1342)

### PM05 P2 Final aid settlement has no delivery confirmation in the client

**Evidence status.** Source verified for the missing confirmation. The client emits final repayments and clears all pending settlements in the same effect. A disconnect or rejected request can remove the retry record even after the borrower has deducted the Gold. Exercise disconnect at final settlement and verify delivery, bankruptcy, and any backing or bequest recipient together. [Debt settlement](src/lib/game/engine/aid.ts#L115) [Client forwarding](src/components/portmasters/GameRoom.tsx#L500) [Aid socket hook](src/lib/use%2Daid.ts)

### PM06 P2 Direct chat can display history under the wrong captain

**Evidence status.** Source verified. Open Direct chat, select one captain, then quickly select another while the first history request is delayed. Each response writes to the same history state regardless of the active target. The previous conversation can also remain visible during loading. The displayed history should match the selected captain throughout. [Conversation selection](src/components/portmasters/GameRoom.tsx#L697) [Direct workspace](src/components/portmasters/GameRoom.tsx#L1273)

### PM07 P2 Voyage log clears on reload

**Evidence status.** Source verified. Perform a purchase or settlement, open the ledger, and reload. The save contains game state while hydration explicitly initializes the ledger to an empty array. The player loses the explanation for transactions, risks, and balances already carried forward in the save. A resumed voyage should preserve enough history to explain those values. [Hydration](src/lib/use%2Dgame%2Dsession.ts#L210) [Autosave payload](src/lib/use%2Dgame%2Dsession.ts#L327) [Ledger consumer](src/components/portmasters/game/GameStatusPanel.tsx)

### PM08 P2 An ordinary harbor restore error can hide an active voyage

**Evidence status.** Source verified. If authentication succeeds while the active room lookup fails, startup treats the room as absent and shows Lobby. There is no retry for the failed restore in this startup path. Test a temporary active room request failure with a valid session and durable membership. A successful retry or clear restore error should replace the empty result. [Session restore](src/app/page.tsx#L21)

## Broker, orders, prices, and freight

### PM09 P1 Broker’s Favor exceeds its 200 Gold payout cap

**Evidence status.** Engine reproduced. At Renown 5, equip Silk Road Monopoly, select Exotic Treasures, and use the Favor for 10 Foreign Balm. With a fixed middle random draw, the order starts at 1,150 Gold. VAT is 20 Gold and the Broker takes 951 Gold. The quote pays 608 Gold before 5 Gold freight. The commission is based on the original base reward, while the percentage bonuses increase the amount the captain actually receives. Verify both premium goods and orders with and without VAT relief. The cap should apply to the payout basis shown to the player. [Payout contract](src/lib/game/constants.ts#L529) [Commission curve](src/lib/game/engine/pricing.ts#L298) [Reward calculation](src/lib/game/engine/orders.ts#L46) [Favor UI](src/components/portmasters/game/phases/Orders.tsx#L158)

### PM10 P1 Trade audits can put Gold below zero and a negative escort fee credits Gold

**Evidence status.** Engine reproduced. With Tax Evasion Ledger, no cash, and enough cargo for a 20 Gold raw order with 5 Gold freight, trigger the audit. The order quote shows 15 Gold net. The captain ends at negative 5 Gold because the audit deducts 20 Gold. At the next pirate choice, hiring an escort adds 1 Gold through a negative fee. The order log still reports the 15 Gold net and the audit is absent from the cost totals. Check the expected handling of a charge above available funds and ensure a fee never credits the wallet. [Trade eligibility and estimate](src/components/portmasters/game/phases/Orders.tsx#L186) [Audit and trade ledger](src/lib/game/engine/orders.ts#L134) [Escort fee](src/lib/game/engine/pirates.ts#L37)

### PM11 P2 Silk Road Monopoly also raises product mandate rewards

**Evidence status.** Engine reproduced for the reward branch. Quote a medium Imperial Mandate with Silk Road Monopoly. Brocade and Sachet qualify because the bonus checks cargo types. The mandate remains exempt from VAT but the payout increases from 260 to 312 Gold. The guide describes a fixed reward and the engine labels the mandate a fixed order. Decide whether fixed means the posted amount stays fixed or only that everyone starts with the same base. Then align the guide and quote. Raw Silk freight on the mixed small mandate is a separate effect. [Mandate templates](src/lib/game/difficulty.ts#L132) [Mandate creation](src/lib/game/engine/orders.ts#L337) [Bonus scope](src/lib/game/engine/orders.ts#L74) [Tutorial contract](src/lib/game/guide.ts)

### PM12 P2 Broker guide and saved module descriptions disagree with current prices and scope

**Evidence status.** Source verified. Equip Broker’s Network and compare the 2 Gold purchase in the board with the Guide’s fixed 5 Gold instruction. Then load a save created before the local changes and open Status, Ship. The displayed descriptions are read from the saved module objects. They can retain the previous Silk Road Monopoly wording or promise exactly two whispers when the remaining pool holds one. Use current rules and cost in every surface for both old and new saves. [Guide](src/lib/game/guide.ts#L176) [Rumor purchase](src/lib/game/engine/orders.ts#L240) [Saved modules](src/lib/use%2Dgame%2Dsession.ts#L164) [Ship descriptions](src/components/portmasters/game/GameStatusPanel.tsx#L320)

### PM13 P2 The rumor count and corruption odds depend on undocumented draw semantics

**Evidence status.** Source verified with deterministic broker scenarios. Five draws with replacement create at most five unique tips and can leave fewer. One ordinary paid whisper has a 30 percent chance to leak a position in Monsoon. Buying a three whisper bundle with both broker modules gives each of those whispers a chance to leak until one does, making the chance of any leak 65.7 percent with at least three tips left and no earlier leak. Farsight draws from the same finite pool and never rolls corruption. Verify one, two, and three remaining tips and specify whether the intended probability applies to a tip or a purchase. [Demand pool and Farsight](src/lib/game/engine/market.ts#L264) [Paid purchase](src/lib/game/engine/orders.ts#L246) [Monsoon odds](src/lib/game/difficulty.ts#L105)

### PM14 P2 Prices blends buys and sales and misses rounds while the panel is closed

**Evidence status.** Source verified. The chart averages market list prices with gross order reward divided by units, then attributes that combined point to the first port seen. A Broker’s Favor card can inflate the series with its gross reward ahead of commission. The snapshot runs inside a view mounted only when Prices is selected, so rounds played with another workspace tab selected can never be sampled later from cleared boards. See a round with both a purchase and a buyer for the same good, then skip a visit to Prices for the following round. Observations should identify the price measure and its actual source, with capture independent of whether the chart is open. [Sample calculation](src/components/portmasters/PriceHistory.tsx#L103) [Snapshot capture](src/components/portmasters/PriceHistory.tsx#L172) [Conditional mount](src/components/portmasters/GameRoom.tsx#L1328)

### PM15 P2 Price history mixes harbors, accounts, and voyage lifetimes

**Evidence status.** Source verified. Open Prices in one harbor, then move to another harbor in the same browser with the same voyage epoch. The storage key only includes that epoch, so the new harbor reads the old data. Logging into a different account in the same browser has the same problem. Distinct harbors and captains should keep independent histories for their respective voyages. [Price storage key](src/components/portmasters/PriceHistory.tsx#L65) [Workspace caller](src/components/portmasters/GameRoom.tsx#L1335)

### PM16 P3 Buy previews and advisor use values that can differ from the transaction

**Evidence status.** Source verified. With Smuggler’s Hold alone, buy a raw card. The actual discount is correct, while the log calls it a boon. The market card shows original unit prices beside the discounted bundle total, and the range tooltip uses the catalogue range, independent of port and Harbor Pulse. On the ship advisor, hold enough for a base upgrade but less than that amount plus Bulk Hauler Rigging’s 15 Gold penalty. The advisor says the upgrade is affordable and claims added cargo capacity and multipliers, while the Shipyard correctly applies the surcharge and the engine changes ship level for slots and freight. [Purchase log](src/lib/game/engine/market.ts#L235) [Port and pulse](src/lib/game/engine/market.ts#L171) [Price range](src/lib/game/engine/pricing.ts#L268) [Market price row](src/components/portmasters/game/phases/Purchase.tsx#L435) [Advisor](src/components/portmasters/StrategyAdvisor.tsx#L243) [Upgrade](src/lib/game/engine/boons.ts#L78)

## Boons, modules, artisans, and settlement

### PM17 P1 Pirate screen gives incorrect raid odds and escort fees for active effects

**Evidence status.** Engine reproduced. In round 12 of Monsoon, start with 100 Gold, a broker leak, Deep Sea Escort Pact, and Persian Dome Compass. The preview formula gives 46 percent and 15 Gold. Settlement rolls at 16.1 percent and charges 7 Gold for an escort. A draw of 20 percent survives. The displayed odds and price should match the choice that actually settles. Verify each effect alone and both with and without a leak. [Settlement preview](src/components/portmasters/game/phases/Settlement.tsx#L30) [Raid and escort engine](src/lib/game/engine/pirates.ts#L10)

### PM18 P1 Income tax counts wages and maintenance twice

**Evidence status.** Engine reproduced. Use 200 Gold revenue, 40 Gold of other tracked costs, an 8 Gold Weaver, 32 Gold maintenance with Overdrive Engine, and Tax Shelter. Wages and maintenance first bring round costs to 80 Gold. Settlement reports 120 Gold costs, then collects 4 Gold on 80 Gold profit. Counting each bill once produces 120 Gold profit and 6 Gold tax at 5 percent. The material cost line can remain zero even after buying materials, since the market purchase path never increments its dedicated counter. [Wages and maintenance](src/lib/game/engine/workers.ts#L133) [End of round calculation](src/lib/game/engine/lifecycle.ts#L18) [Purchase costs](src/lib/game/engine/market.ts#L216)

### PM19 P2 Tax and endgame ledgers disagree about what was paid

**Evidence status.** Source verified. Complete a VAT bearing order, then close a round with no new taxable sale. VAT is cumulative yet logged again as this round’s VAT. With Tax Shelter and both tax modules, assessment floors the intermediate amounts after each module but the log labels only the base 5 percent. With a small positive profit rounded to zero tax it logs no profit. Endgame total costs omit worker wages even though the wallet and round totals include them. Verify round VAT, cumulative VAT, displayed effects, and voyage cost totals from the same sequence. [Tax calculation](src/lib/game/engine/pricing.ts#L176) [Round and voyage tax log](src/lib/game/engine/lifecycle.ts#L29) [Cost tracking](src/lib/game/engine/workers.ts#L133) [Voyage profit display](src/components/portmasters/game/phases/Endgame.tsx#L279)

### PM20 P2 Master’s Apprentice discounts existing payroll

**Evidence status.** Engine reproduced. Hire a Weaver in a prior round, then choose Master’s Apprentice without hiring anyone new. An 8 Gold existing wage drops to 4 Gold. Artisan’s Workshop adjusts that already discounted value, while the hire panel also prints undiscounted base wages in its explanatory list. The boon promises a hiring reduction, and the game takes no Gold at the moment of hire. Agree on the intended discount target and show a single consistent commitment in the roster, hire action, and dues. [Boon description](src/lib/game/constants.ts#L357) [Hiring](src/lib/game/engine/workers.ts#L14) [Shared wage formula](src/lib/game/engine/pricing.ts#L289) [Hire panel](src/components/portmasters/game/phases/WorkerMgmt.tsx#L687)

### PM21 P2 Artisan’s Inspiration excludes captains with only charter workers from its draft pool

**Evidence status.** Engine reproduced. At the late charter, keep one Potter and no Weaver, Master Weaver, or Sachet Maker. The boost would apply to the Potter if it were active, but selection weights the boon at zero for this crew. Across 10,000 drafts using this fixture, every other eligible boon appeared and Inspiration never did. Check all seven worker types for the stated all worker effect. [Draft weights](src/lib/game/engine/boons.ts#L8) [Production bonus](src/lib/game/engine/workers.ts#L97)

### PM22 P2 Settlement status can imply that paid bills are still due

**Evidence status.** Source verified. Pay wages and maintenance and enter the Shipyard. The Status panel’s Due tile still sums full wages and maintenance during Phase 4. Installing or swapping Overdrive Engine there changes the displayed current amount, although this round’s maintenance already settled. Keep the current round paid amount and the next projected bill distinct. [Settlement sequence](src/lib/game/engine/lifecycle.ts#L76) [Status dues](src/components/portmasters/game/GameStatusPanel.tsx#L100) [Module penalties](src/lib/game/engine/boons.ts#L93)

### PM23 P3 Freight labels and rounding leave module combinations ambiguous

**Evidence status.** Engine and source verified. The Ship tab shows only the base ship formula. The order explanation can go below the base minimum through Rigging, Overdrive, Silk Winds, Monopoly, or Fleet of Treasures. The revised implementation applies Rigging and Overdrive before Silk Winds, which changes effective savings compared with the original sequence. For example, a 10 unit all Silk order at level 2 with Overdrive and Silk Winds costs 2 Gold in the current tree. Applying the old 5 Gold minimum after Silk Winds and then Overdrive yields zero. The current quote and settlement agree. The design still needs a single documented order of operations and rounding rule, including whether an eligible units share of reward should be based on units, value, or the entire order. [Freight rules](src/lib/game/engine/pricing.ts#L46) [Ship overview](src/components/portmasters/game/GameStatusPanel.tsx#L302) [Reward allocation](src/lib/game/engine/orders.ts#L59)

## Responsive layout and accessibility

### PM25 P1 The Hold widget has virtually no visible content in phone landscape

**Evidence status.** Reproduced in Chromium. Open the workspace and Status, Hold with all charter goods present. At 667 by 375 it has 16 CSS pixels of visible inner scroll area for 398 CSS pixels of content. At 844 by 390 it has 31 pixels, and at 320 by 568 it has 63. The dialog shell and workspace both hide overflow while the pinned status tiles and tabs take most of the height. The content scrolls in a strip shorter than an inventory row at 667 by 375. Ship, Dues, and Log share the same height allocation. The workspace must reserve a usable content area or allow the pinned sections to scroll when height is scarce. [Workspace dialog](src/components/portmasters/GameRoom.tsx#L1498) [Pinned status and tabs](src/components/portmasters/game/GameStatusPanel.tsx#L123) [Hold scroll region](src/components/portmasters/game/GameStatusPanel.tsx#L219)

### PM26 P2 Barter’s receive selector extends beyond its card

**Evidence status.** Reproduced in Chromium at 667 by 375 on a Monsoon fixture with the full catalogue. The receive selector’s right edge extended 11 CSS pixels past the clipped composer. At that width the layout uses two intrinsic size content columns with a fixed middle column for the fairness control. The input rows need to remain inside the composer as both the viewport and parent width narrow. [Composer grid](src/components/portmasters/game/phases/BarterPhase.tsx#L391) [Fairness column](src/components/portmasters/game/phases/BarterPhase.tsx#L458) [Receive selector](src/components/portmasters/game/phases/BarterPhase.tsx#L486)

### PM27 P2 Large boards bury the phase action on phones and tablets below the desktop breakpoint

**Evidence status.** Reproduced in Chromium with a late Trade board. At the top of the page, the global Continue button starts at vertical pixel 3,578 on a 320 by 568 phone, 1,870 at 667 by 375, 1,520 at 844 by 390, and 1,363 at width 1,023. It is reachable through document scrolling. Starting at 1,024 by 768 the phase panel scrolls independently and the action starts at pixel 697. At 1,280 by 720 it starts at pixel 649. The narrow and short layout should keep the phase action discoverable without requiring a trip through the entire board. [Responsive shell](src/components/portmasters/GameRoom.tsx#L1349) [Action position](src/components/portmasters/GameRoom.tsx#L1466) [Phase scroll owner](src/components/portmasters/game/GamePhasePanel.tsx#L70)

### PM28 P2 Price history detail is unavailable through tested touch and keyboard paths

**Evidence status.** Reproduced in Chromium with touch emulation. Tap the line chart at widths 320, 667, and 844. The same point yielded a detail tooltip on mouse movement and none on tap. The SVG also lacks a keyboard focus or navigation path and exposes a generic image label. Even with a mouse the populated tooltip measured 277 CSS pixels tall and extended to vertical pixel 490 in a 375 pixel viewport. The workspace clips it. Provide the same round and goods detail through touch and keyboard, and keep the detail readable within the scroll owner. [Chart events and semantics](src/components/portmasters/PriceHistory.tsx#L461) [Overlay bounds](src/components/portmasters/PriceHistory.tsx#L643)

### PM29 P2 Trade and market explanations depend on hovering nonfocusable text

**Evidence status.** Source verified. Tab through an order card and a purchase card. The freight, VAT, total cost, and glossary controls are spans without a tab stop. The nearby trade or purchase button does not expose those details. Provide keyboard and touch access to the same explanations and retain ordinary purchase and trade actions. [Shared term](src/components/portmasters/Term.tsx#L32) [Order details](src/components/portmasters/game/phases/Orders.tsx#L268) [Market details](src/components/portmasters/game/phases/Purchase.tsx#L435)

### PM30 P2 Dark tutorial text and headings have very low contrast

**Evidence status.** Reproduced in Chromium using the in app dark theme. In the Bartering, Artisan, and Settlement steps, body copy uses RGB 51, 51, 51 over RGB 3, 18, 24, about 1.5 to 1 contrast. Round flow and bill cards instead inherit nearly white headings on pale backgrounds. The Artisan Wages heading is close to 1 to 1. The surrounding dialog theme cannot correct inline colors in the tutorial markup. Use readable contrast for both card headings and plain paragraphs in both themes. [Tutorial markup](src/lib/game/guide.ts) [Artisan and bill markup](src/lib/game/guide.ts) [Tutorial renderer](src/components/portmasters/game/GameModals.tsx#L497)

### PM31 P2 Landscape authentication opens with the submit action more than two screens down

**Evidence status.** Reproduced in Chromium at 667 by 375 with the sign in tab. Submit started at vertical pixel 853. The decorative brand number fills most of the first screen before the form. Scrolling reached the form. At 320 by 568 the title stayed within the clipped pane. The issue is the height of the brand section on a short screen. The sign in and create account modes should put the form or a clear way to reach it in the initial viewport. [Authentication shell and brand](src/components/portmasters/AuthScreen.tsx#L75) [Forms](src/components/portmasters/AuthScreen.tsx#L124)

### PM32 P3 Dialog widths reach the screen edge at the landscape breakpoint

**Evidence status.** Reproduced in Chromium. At 667 by 375, New Harbor, Directory, Captain’s Profile, and the workspace run from horizontal pixel 0 to 667. Their smaller geometry at 320 and larger geometry at 844 leave side gutters. The shared width cap is replaced by a breakpoint width wider than the handset, while the dialog’s width is 100 percent. The short Directory also has an inner scroll area inside the shared dialog scroll area. Check the lowest row and its actions with touch scrolling and a safe area. Close remained reachable after the tested dialogs settled. [Dialog sizing and scrolling](src/components/ui/dialog.tsx#L60) [Directory body](src/components/portmasters/CaptainsDirectoryDialog.tsx#L341) [Mobile workspace](src/components/portmasters/GameRoom.tsx#L1498)

### PM33 P3 Barter tint backgrounds are invalid with the new goods palette

**Evidence status.** Source verified. The theme palette returns a CSS color mixing expression. The offer and receive cards append the literal hex alpha suffix to that expression, which produces an invalid background color. This also affects existing offer cards that assemble a tint the same way. Test both palette preferences and both themes. The item name and amount should remain legible, and any tint should use a valid CSS color. [Palette resolver](src/lib/use%2Dcolor%2Dpreference.ts#L10) [Composer tints](src/components/portmasters/game/phases/BarterPhase.tsx#L437) [Offer tints](src/components/portmasters/game/phases/BarterPhase.tsx#L785)

### PM34 P3 Voyage introduction hardcodes eight voyages for every difficulty

**Evidence status.** Reproduced in Chromium. Enter a Monsoon harbor and read the welcome text. It says eight voyages await. The Monsoon configuration has sixteen rounds per voyage. Open Waters has twelve rounds and Fair Winds has eight. The overview should identify the number of rounds in the selected voyage. [Welcome](src/components/portmasters/game/phases/Welcome.tsx#L360) [Difficulty configuration](src/lib/game/difficulty.ts#L50)

### PM35 P2 The lobby Harbor button loses its accessible name on narrow screens

**Evidence status.** Source verified. At widths below 640 CSS pixels, the only text label is hidden. The remaining icon button has no explicit accessible name. Harbor activity, daily check in, and lobby messaging are reached from this button. At 320 or 390 pixels, the control should be identifiable through its accessible name as well as the icon. [Lobby Harbor entry](src/components/portmasters/Lobby.tsx#L389) [Harbor dialog](src/components/portmasters/Lobby.tsx#L915)

### PM36 P2 The captain logbook is shared across accounts in one browser

**Evidence status.** Source verified. Save a note in Logbook, switch accounts in the same browser, and open Logbook in the same harbor and voyage. The storage key uses harbor and voyage only. Notes should belong to the captain who entered them and remain distinct after account switches. [Logbook storage](src/components/portmasters/CaptainLogbook.tsx#L89) [Workspace caller](src/components/portmasters/GameRoom.tsx#L1338)

## Reconciliation of the earlier draft

1. Desktop pages growing past the viewport. The working tree already bounds the room at desktop widths. The browser matrix verified the desktop scroll owner and action position. PM25 through PM27 record the remaining responsive failures.
2. Broker’s Network debiting two fees. The current purchase charges once, reveals up to the available count, and checks phase and funds before charging. The fixtures checked no tips, one tip, and at least three tips with each broker module combination.
3. Wrong port on a guaranteed order. The current generator uses the revealed port. The fixtures checked both item and port, and the current presentation resolves the port for older saved boards with matching slot and item.
4. Guild, Bureau, and Exotic effects applying to all charter goods. The current filters cover tier one products, tier one raw goods and products, and tier two products respectively. Tests compared eligible and ineligible cargo. The remaining reward questions are PM09, PM11, and PM23.
5. Raw Silk and Silk products treated as one category. The current engine uses recipe ingredients for Silk products, including Foreign Balm and Pearl String. Raw Silk is eligible for the Monopoly freight waiver, and the qualifying part of mixed cargo receives the freight effect.
6. Rerolls advertised once per voyage. The current draft controls say once per round, matching the reset. Boons cost 10 Gold to reroll. Module rerolls are free. The random draw can return overlapping options, since both rerolls draw again from eligible pools.
7. Production preview and settlement attribution. The current preview shares the output function and the ledger names the boon and module independently. PM20 and PM21 cover remaining worker rule mismatches.
8. Expected prices missing product discounts and VAT naming the wrong artisan. The current estimates share card discount logic for both resource and product ranges. The VAT explanation uses the actual recipe worker label. PM16 records what the estimates still omit.
9. A single dark palette for all goods. Room views now receive a theme aware palette, including Price History. PM30 confirms a separate contrast failure in the tutorial, and PM33 records a palette integration failure.
10. Price tooltip right edge and authentication title clipping. The 180 pixel reserved chart width still differs from its 220 pixel maximum, but the measured tooltip was 166 pixels wide. Its reproduced failures were vertical clipping and touch access. The authentication title fit at 320 CSS pixels.

## Effect combination coverage

The engine fixture used 14 boons, 14 modules, and a control with no boon. It evaluated 470 loadouts of zero to three distinct modules and 7,050 boon and loadout states with all charter content available. The same effects were evaluated in 35,715 total installation sequences. Checks compared direct quotes with settled order Gold and Reputation on 126,900 cases, purchase quotes with charges on 105,750 cases, and production output on 98,700 worker cases. Random audits and refunds were disabled for those quote agreement checks. Targeted checks enabled the relevant effects and controlled the random draw where needed. Identical results across install order held for the evaluated deterministic pricing, payroll, tax, and tracked penalties. That does not establish the intended stacking formula.

### Boons and corresponding effects

1. Silk Winds and Favorable Tides. Freight subjects included raw Silk, Silk recipes, charter goods, and mixed loads. PM23 records minimums and ordering.
2. Merchant’s Charm and Hemp Monopoly. Mixed module loadouts and all goods were priced and purchased. PM16 records cost attribution and the difference between a board estimate and an exact lot.
3. Artisan’s Inspiration and Master’s Apprentice. Checked skilled and ordinary production with Workshop, existing payroll, and an all Potter crew. See PM20 and PM21.
4. Emergency Loan. Application grants 40 Gold in the fixture. The boon is a grant under its description and adds no outstanding debt.
5. Tax Shelter and Frontier Tariff Relief. Checked income tax with both tax modules and product VAT with Ledger, including flooring. PM18 and PM19 cover settlement and reporting.
6. Farsight and Merchants Converge. Farsight takes one available tag from the same pool used by paid rumors. Converge adds a generated board slot before guarantees are applied.
7. Kiln and Forge Guild and Exotic Treasures. Checked eligible and ineligible goods with Bureau Token and Monopoly. PM09 and PM23 cover reward basis and combinations.
8. Deep Sea Escort Pact. Confirmed fee and raid reductions, including Compass and a leak. See PM17.

### Modules and corresponding effects

1. Smuggler’s Hold and Tax Evasion Ledger. Checked purchase and income tax stacking, VAT relief, and an audit with low cash. See PM10, PM16, and PM19.
2. Bulk Hauler Rigging and Overdrive Engine. Checked freight, the 15 Gold upgrade surcharge, and the 10 Gold maintenance surcharge. See PM16, PM18, PM22, and PM23.
3. Artisan’s Workshop. Checked the wage multiplier and bonus output together with either relevant boon. See PM20.
4. Silk Road Monopoly and Fleet of Treasures. Checked mixed raw cargo, Silk recipes, mandate cargo, and premium goods. See PM09, PM11, and PM23.
5. Broker’s Network and Ocean Interpreter. Checked count and purchase fee together and apart at pool exhaustion, plus the guaranteed order ports. See PM12 and PM13.
6. Salvage Crane. The refund branch returns the charged freight and reverses that cost in both ledgers. The standard quote shows the cost before this random refund.
7. Maritime Bureau Token, Kiln Cellar, and Foreign Quarter Pass. Checked charter order scope and purchase reductions on the relevant goods, including when other modules are active.
8. Persian Dome Compass. Checked with the escort pact and broker leak. See PM17.

## Browser and system verification

Chromium viewport sweeps covered 320 by 568, 390 by 844, 667 by 375, 844 by 390, 768 by 1024, 1023 by 768, 1024 by 768, 1280 by 720, and 1440 by 900. Rendered fixtures included sign in, Lobby, Welcome, boon draft, buying, barter, workers, trading, pirate choice, settlement bills, shipyard, module draft, module swap, bankruptcy, and endgame. Focused checks opened create and join, directory, captain profile, settings, tutorial, whispers, workspace status, crew, chat, and prices. The late room fixtures exercised enlarged inventories and charter content. Two captain browser checks reproduced the cargo loss and progress failures in PM01, PM03, and PM24. Temporary response errors reproduced PM04.

The existing lint and TypeScript checks and the production build passed. Ten game rules tests passed. The local integration test passed with HTTP, authentication, persistence, rooms, chat, and realtime sharing port 2154. The browser and engine runs used a temporary copy with the locked application dependencies, isolated accounts, and an isolated SQLite database. Browser widths are CSS pixels and do not represent certification on physical devices.

Additional verification still matters for Safari and Firefox, browser chrome and onscreen keyboard resizing, real touch devices, browser zoom, assistive technology, populated harbor and voyage result screens, and failure during aid, convoy, backing, and notifications. The report identifies the specific observed defects and source paths above. Physical device behavior and every multiplayer timing sequence remain open.

## Verification after fixes

### Shared play and saves

1. PM01 and PM02. Two captains advanced from Barter and the unmatched Hemp returned. A separate run rejected a departed recipient and an unaffordable deal. Simultaneous cancellation and acceptance produced one outcome and conserved cargo and Gold.
2. PM03 and PM24. Two captains advanced after one reloaded while ready. In pirate waters, the global shortcut left both players at the personal choice. After both hired escorts, the shared settlement vote advanced them to the Shipyard.
3. PM04, PM07, and PM08. A failed voyage read preserved the stored save and showed retry. Failed writes displayed an error. Two orders completed while an earlier response was held saved in order. A stale revision returned 409. Reload restored the voyage ledger. A failed active harbor lookup recovered on retry.
4. PM05. An interrupted final save kept the repayment pending. After retry and reconnect, a 30 Gold repayment reached the bequest, 70 Gold coverage reached the lender, and 10 Gold returned to the backer. Reload did not repeat the credits.
5. PM06. A delayed Direct history response never appeared under the captain selected afterward.

### Rules and amounts

1. PM09, PM10, and PM11. The report’s premium Broker’s Favor example quoted 199 Gold before freight. An audit collected available Gold, stopped at a balance of zero, and recorded the amount as an expense. A medium Imperial Mandate paid its fixed 260 Gold with zero VAT.
2. PM12 and PM13. A legacy equipped module displayed current wording. The Guide explains the live rumor price and bundle sizes. Tests checked one corruption roll at each paid bundle size and a pool of five distinct tips.
3. PM14, PM15, and PM36. The price panel distinguishes market listings from net buyer quotes, records without being opened, and separates harbor and account storage. Two accounts in the same browser shared a harbor while keeping separate logbook entries.
4. PM16 and PM23. The advisor included the 15 Gold upgrade surcharge. Purchase logs attributed savings to the named effects, and raw price estimates used the same port and Harbor Pulse calculation as the market. The freight order is documented and the report fixture still quotes 2 Gold.
5. PM17 through PM22. The reported pirate combination quoted 16.1 percent and a 7 Gold escort. The tax fixture charged 6 Gold, counted 80 Gold of costs, and kept current round VAT distinct from voyage VAT. Existing workers kept their wages while new hires received the first settlement discount. Charter only crews could draft Artisan’s Inspiration. Shipyard showed paid bills separately from the next estimate.

### Layout and accessibility

1. PM25 through PM27. Hold content could scroll in the workspace at 320, 667, and 844 CSS pixels. The Barter composer fit at 667 by 375, and the phase action stayed visible across all nine reported viewports.
2. PM28 through PM30. Price details opened by touch and exposed a keyboard round selector. Freight details opened by keyboard focus and touch. Dark tutorial headings and body text used readable colors on their respective surfaces.
3. PM31 through PM36. Landscape sign in fit within the 375 pixel viewport. Dialogs kept side gutters, and the production Directory scrolled by touch to the lower rows with Close still reachable. Barter tint values parsed as CSS colors. Monsoon Welcome showed 16 rounds. The narrow lobby Harbor button had an accessible name. The logbook account switch check preserved the original author’s entry.

## Follow up audit

1. Market draws reused the probabilities of removed goods. Later draws now use the weights of the remaining goods. Item previews use the same finished good price calculation as generated cargo lots. The market reference shows unlocked goods and the Prices view remains the source for recorded trends.
2. Boon History read modifiers that had already expired. The selected Boon ID now persists separately, and saved draft cards refresh their descriptions from the catalogue. Only offered Boons can be selected.
3. Three module effects depended on redundant values in the save. Upgrade surcharges, maintenance surcharges, and paid rumor prices now derive from equipped modules. Drafts exclude already equipped modules. Paid rumor bundles and the free Farsight rumor use the same finite pool.
4. A worker card showed base output while the production preview included Boon and module bonuses. Both now use the shared production calculation. The guide also lists the recipes a Master Weaver inherits from a Weaver. The unused worker progress field, recipe values, pricing wrappers, and decorative price charts were removed.
5. The VAT breakdown treated the sale price as the base and displayed a tax amount as the result. The breakdown now shows the taxable margin, base VAT, adjustments, and amount charged. Welcome and the guides show the current difficulty, round sequence, and costs.
6. Shared standings could crown a captain who defaulted on a loan. Bankruptcy now reaches the standings, and SQLite records the result together with Renown and merits. Reconnecting restores the standings. Older voyages can recover already awarded progress from retained activity records.
7. The Render Blueprint provides one web service with persistent SQLite storage. The custom server accepts Render's assigned port, and the README records the deployment steps. A clean install with the refreshed dependency lock reported no advisories.

The effect checks covered 7,050 Boon and module combinations and 35,715 installation orders. The full verification suite covered 24 unit tests, the realtime integration test, lint, type checking, and the production build. Chromium checks covered nine viewport sizes and verified the difficulty copy, saved Boon descriptions, production bonuses, and paid rumor bundles.

A local production restart on the Render port restored the standings without paying Renown twice. The same check excluded a captain who defaulted on a loan despite having the highest Reputation. A fixture with the older result format recovered its standings using retained activity without issuing another award.

The repository verification passed lint, type checking, 21 game rules tests, the server integration test, and the production build. The effect fixture covered 7,050 boon and loadout combinations and 35,715 installation sequences. The schema update preserved the seeded save in a database using the earlier schema. Browser checks used Chromium viewport and touch emulation.

## Artwork and rules audit

1. Ship graphics were still supplied by several generic icons and by text stored in saves. The shared SVG now supplies full ship art and compact icons. The module lists, guide, tutorial, notifications, and ledger render old ship characters through that same SVG. Captain messages retain their original text.
2. The guide described Fleet of Treasures as the final freight modifier even when Cargo Net or Convoy Pennant applied. The guide now distinguishes the two voyage rule versions. The tutorial and glossary reuse the live catalogue, including the charter schedule, recipes, and artisan assignments.
3. Completed voyages displayed the next round counter as rounds sailed. The dashboard and copied summary now show the actual number of rounds and identify trading profit before Income Tax.
4. Tidewatch and the order race relied on memory and a live socket. The room now records both outcomes for the current voyage. Rejoining restores the Tidewatch bonus and the race honors the same winner. A replay credits the race reward once.
5. Quick Actions had a second state path with no callers. The keyboard shortcut now opens the same dialog as the room menu. The source import graph reached every source module, and the public icons are used by the goods views. The source and public trees contained no empty directories.

The audit passed 35 unit tests, the realtime integration test, lint, type checking, and a production build. The effect run covered 23 Boons, 23 modules, and 267,744 installation sequences. The balance run repeated 5,000 simulations per difficulty. The earlier SQLite fixture retained its room and both saves after applying the current schema.

Chrome checks used nine viewport sizes. The production run checked the harbor and captain dialogs, guide, tutorial, old ledger entries, the Broker badge, and a live two captain round that awarded Word on the Docks and reloaded the winner without another credit. The deployment settings were read against the provider references. [Render Blueprint reference](https://render.com/docs/blueprint-spec) [Railway volume reference](https://docs.railway.com/volumes)

## Core rules audit after the rebalance

- Saved module cards used older descriptions after reload. Equipped modules, drafts, and pending swaps now use the saved voyage version. Market tooltips also use the versioned recipe.
- Shipyard spending could leave a captain without funds for Income Tax. Version 3 now reserves the tax calculated on arrival at the Shipyard. An install or swap affects the following round. Collection is limited to available Gold.
- Stacked discounts and Wage Ledger could misstate the amount paid. The ledger now records realized savings and charges.
- Workshop forms now reopen with the booked quantity. The Strategy Advisor uses the actual bills and order quotes. Completed voyages display the correct round count.
- Story entries keep their original round. Removed the unused Story amount fields and speculative round summaries, plus unused engine exports and duplicate glossary construction.
- A pending Word on the Docks claim now retries until acknowledged while the captain remains connected.
- The source graph found no unreachable application modules or empty source directories. The original Hemp, Silk, and Tea PNG assets have no runtime references after the SVG conversion. They remain in the repository as original artwork.

Verification passed 46 unit tests, one multiplayer integration test, and the production build. The effect sweep covered all 23 Boons and 23 modules across 267,744 installation sequences. The 15,000 voyage simulation reproduced the prior solvency rates on all three difficulties. Chrome checked nine viewport sizes, restored module descriptions and workshop quantities, settled a live barter once, and recovered the booking after a server restart.

## Follow up on readiness and price accuracy

1. Captains could buy goods, pay the Broker, assign work, or trade after submitting a ready vote. The controls now lock until the vote is cancelled or the harbor advances. Trades accepted by another captain still settle from the shared ledger.
2. Harbor Pulse added reports held in server memory. The next round now reads one saved purchase total per captain for the previous round. Restarting the server preserves the resulting price adjustment. A saved captain who already finished or went bankrupt is restored as inactive, so an offline terminal captain no longer blocks the room.
3. Completed purchases and sales could start displaying a different quote after a limited discount or bonus was spent. The cards now show the settled Gold, including refunds and audits on sales. Older receipts without a stored amount refer to the ledger. Price history uses opening quotes and excludes personal workshop lots, workshop contracts, and clearance sales.
4. The barter board called any vanished offer settled, including withdrawals. It now reports recently closed offers. The verdict and amounts for a particular exchange remain in the ledger.
5. The guide and effect descriptions now distinguish Market Day adjustments from Harbor Pulse, explain the order of the relevant freight and purchase discounts, and describe when the Workshop Supplier closes. Removed unused engine exports, the obsolete Harbor Pulse socket reports, and a redundant module that only advanced the barter phase.
6. The source graph found no unreachable application modules or empty source directories. The original PNG artwork in the public icons directory remains archived. The game uses the SVG icons.

Verification passed 48 unit tests, one multiplayer integration test, lint, type checking, and the production build. The effect sweep exercised 23 Boons and 23 modules across 267,744 installation sequences. The 15,000 voyage run reproduced the previous solvency rates on all three difficulties. Chrome checked nine viewport sizes and verified locked controls, a cancelled barter and its returned cargo, finished trades and their receipts, and Harbor Pulse after a restart. A separate restart check advanced the host with a saved bankrupt captain offline.

## Harbor recovery and settlement audit

1. Harbor Pulse disappeared from the room checkpoint as soon as one captain left the Boon draft. This allowed a captain who missed the release to open the same round with stale prices. The server now retains the adjustment in memory and in storage through the rest of the round, then clears it for the next draft.
2. Voluntary repayment and Convoy Venture funding could consume the Gold that version 3 reserves for Income Tax. The Shipyard, repayment form, and server now use the same reserve calculation. Repayment and funding wait until a captain cancels their ready vote.
3. Convoy stakes and payouts previously depended on live messages to change Gold. Funding, terminal outcomes, and their receipts now commit together. The existing harbor ledger restores missed entries once, and the transaction prevents a second filled venture in the same voyage. Joining the harbor restores the board even if the first request arrived too early. Restarting the voyage clears the previous board and its lock. Removed the superseded client wallet functions.
4. Corrected Workshop Supplier discount descriptions, clearance reward exclusions, the roster order for bonus production, and the loan default and Convoy Venture instructions. Settlement now processes artisan output in one pass. The briefing no longer draws an empty panel for an expired buyer preview.
5. The import audit reached all 148 source modules. It found no empty project source or asset directories. The three archived commodity PNG files are original artwork with no runtime references. The punctuation scan found technical syntax and paths, with no dash punctuation in project prose or comments.

The full verification suite passed 49 unit tests, one multiplayer integration test, lint, type checking, and the production build. The effect sweep checked 23 Boons, 23 modules, and 267,744 module installation sequences. The 15,000 voyage simulation matched the previous results on all three difficulties.

Desktop and mobile Chrome verified the tax reserve, the restored Convoy Venture board, and an offline captain receiving a payout exactly once after reconnecting. The same run checked nine viewport sizes and recovered Harbor Pulse and a saved workshop booking after restarting the server.

## Rules version 4 follow up audit

November 22, 2026. The earlier findings remain a record of the snapshots named above. The live rules, setup instructions, and player guidance are in [README.md](README.md) and the Navigation Guide.

1. Collector's Seal now treats the first ordinary ceramic sale as the trigger even if it pays no bonus. A resumed trade board preserves that timing. Open Hold counts distinct raw materials, and Traveling Commission no longer promises another turn in the final round.
2. Advisor dismissals belong to the captain, harbor, voyage, and round. The Prices view keeps the first observed buyer quote. The Story distinguishes ledger notes from round markers.
3. The Broker board explains when the paid bundle has already been used. Effect descriptions and the Guide clarify ordinary order eligibility, wage rounding, Signal Lantern timing, and what a redraw can return.
4. The source reference check found no orphaned application modules. Three unused dialog wrappers and two unused phase callbacks were removed. The three PNG files in the icons folder are intentional archives, as described in the README.

## Current rules and source audit

November 22, 2026. Reviewed the current checkout and compared the version 5 Boon and module descriptions with their engine triggers, quote calculations, settlement, and ledger handling. All 26 Boons, 28 modules, and 27 Boon modifier keys have corresponding engine references. The existing rules tests cover Broker order identity, quote and settlement amounts, effect caps, effect timing across saves, Port Exchange exclusions, and version 5 combinations. No dangling effect identifier or description mismatch was found in this review.

The import scan found no orphan application modules. `src/server/prepareDatabase.ts` is an explicit target of the database preparation command. No empty folders were found in the source, public, or test trees. The three PNG files in `public/icons` have no runtime references. The README identifies them as original archived artwork.

The balance command guide now states that the default run uses rules version 2 and that adding `rebalanced` after the seed count runs rules version 3. Language scans found no mixed Chinese and English content, no en dash or em dash characters, and no dash marks in project prose or source comments. Remaining ASCII dash characters are part of technical syntax such as URLs, imports, CSS names, HTTP headers, and command options.

`npm run verify` passed lint, 71 unit tests, one multiplayer integration test, TypeScript checking, and the production build.

## Broker payout and price display review

November 22, 2026. A large Broker favor can cost Gold when freight exceeds the capped payout. The favor explanation and Navigation Guide now describe that outcome. The Strategy Advisor, clearance quote, staple quote, and workshop quote display a cost in words when their net amount is negative. The Exchange guidance now accounts for price rounding.

The source import audit found no orphan application modules or empty source, public, or test folders. The three original commodity PNG files remain archived as described in the README. Existing captain authored text and technical syntax retain their original characters.

## Effect timing and Reputation display audit

November 22, 2026. Traveling Commission, Storm Dividend, and Market Momentum now consume their first eligible order when the percentage bonus rounds to zero. Reloading the saved state keeps each effect consumed. A costly Broker favor can reduce Reputation below zero. The roster, captain details, voyage results, copied summary, and ledger now express that value in words. Existing saved ledger entries use the same display wording.

Market Day guidance now identifies the price adjustment and its rounding without promising a lot at the arrival port. The source reference audit reached all 143 application modules and found no empty source, public, or test folders. The three unreferenced commodity PNG files are archived original artwork identified in the README.

The effect sweep checked 21,978 Boon and module configurations across rules versions 4 and 5, including 87,912 order quotes and settlements. The full verification command passed 76 unit tests, one multiplayer integration test, lint, TypeScript checking, and the production build. Chrome verified a negative Reputation produced by a Broker order in the room and endgame, plus the freight tooltip and player guide.

## Original economy and saved voyage review

November 26, 2026. The checkout already contained the restored opening in version 5. Version 6 keeps the original six lots, six buyers, opening cargo, ship level, recipes, charter timing, ordinary price ranges, starting funds and base maintenance. The comparison uses the playable engine from commit `773df1c`. The founding rules in `3d8e57e` also use six opening buyers and value raw orders at five Gold per unit plus a buyer premium.

1. The Broker could sell a commission that the captain had already seen in the previous round. New voyages carry the announced terms forward, including reports earned before a Signal Lantern swap. Paid whispers and Farsight draw from the remaining buyers. Market Day announces a mixed buyer seeking the featured material. Its order and the import lot occupy existing slots.
2. The purchase screen labeled the cheapest bundle as the best deal without considering what the captain needed. It also counted limited discounts more than once in its budget projection. The screen now shows actual lot savings, cash, outstanding bills and remaining offers.
3. Artisan Boons previously used a fixed cash threshold even when the captain already employed the required artisan or could hire one at the discounted wage. New drafts use actual payroll and worker eligibility. The last Shipyard draft also omits modules whose effects can no longer pay during the voyage.
4. The disconnect timer could delete an unattended room and both personal saves. An unattended voyage now keeps its seats and checkpoint. Empty lobbies still expire. Active play retains the departure window for absent captains.
5. The price history filter reset when new observations arrived, and an initial quote appeared stable. Price history now preserves the selection and distinguishes a first quote from a trend. Final standings capture the previous best before awarding Reputation. Activity and Chronicle views render recorded losses in words and associate voyage events with their harbor.
6. The balance simulator skipped escorts in the archived game because the original quote omitted a later field. It now reads the original raid exposure, wages, recipes and prices. Each solo captain can earn the harbor race and generate Harbor Pulse. Recovery pairs each affected run with the same strategy and seed without the loss.

### Measurements

The default comparison ran 150 shared seeds on each difficulty. It covered 1,800 opening boards and 14,400 scripted voyages including recovery controls. For the best feasible combination of sales from starting stock, both the original engine and version 6 returned 15, 47 and 76 Gold at the tenth, fiftieth and ninetieth percentiles on every difficulty. The median was one order. Version 4 medians were 102, 111 and 121 Gold respectively, with three orders.

For raw, artisan and mixed trading respectively, version 6 solvency was 100%, 100% and 99% on Fair Winds, 99%, 87% and 89% on Open Waters, and 55%, 44% and 52% on Monsoon Season. The corresponding median trading cash margins after cargo costs, freight and wages were 205, 403 and 306 Gold on Fair Winds, 318, 432.5 and 452.5 Gold on Open Waters, and 366, 422 and 433.5 Gold on Monsoon Season. These margins exclude upkeep, escort costs and the value of stock still in the hold.

Of 27,382 immediate Exchange resale quotes observed by the arbitrage strategy, 25,843 lost Gold, 623 broke even and 916 made a profit. The Fair Winds artisan policy led on 110 of 150 seeds, down from 121 under version 5. In Monsoon Season, 43 of 150 recovery voyages finished after losing up to 35 Gold in round four, compared with 78 matched controls. These figures describe the seven scripted strategies. Human play and barter can change the outcome.

### Verification

Across 360 replayed voyages on saved versions 1 through 5, all 12,172 sampled game states matched the previous release. The server restart test restored each rules version through the room socket and personal save API after the process was left unattended beyond the departure window. It then completed final settlement. In separate production browser checks, archived saves from versions 1 through 5 reloaded, traded, hired an escort and settled their final round. Their closing Gold, Reputation, VAT and Income Tax matched the previous release. The order effect sweep exercised 65,934 combinations of quotes, settlement and retries using each Boon and each module individually and in pairs.

Two captains completed eight rounds of Fair Winds in production Chrome. They exchanged Hemp for Silk, used a Broker order after reloading, produced Linen Clothes, sold at the Exchange, installed modules and saw the same standings. Finch finished with 296 Reputation and 205 Gold. Wren finished with 266 Reputation and 57 Gold. The purchase and trading screens fit desktop, portrait phone and landscape phone viewports.

An older harbor that had yet to set sail could bring its free version 4 ship level and opening balance into the new rules. The first launch now initializes the versioned opening from the new room plan and the captain’s Renown allowance. In production Chrome, two captains launched from a saved version 4 waiting room on each difficulty. All six opened at ship level zero with six lots and six buyers. Opening Gold and upkeep were 100 and 15 on Fair Winds, 100 and 18 on Open Waters, and 90 and 22 on Monsoon Season.

`npm run verify` passed lint, 90 unit tests, the server integration test, type checking and the production build. The separate balance command was `npm run test:balance:harbor` with its default 150 seeds.

The source reference review found no unreachable application modules or empty folders under source, public assets, tests or Prisma. The three original commodity PNG files are documented archive assets. The review removed misleading price estimates and a redundant order draw. Rendered regression checks cover signed prices and Reputation, settlement, endgame, historical ledger text and player guides across the saved rules versions.
