# Retired services

## agmarknetService.js.retired

The data.gov.in / AGMARKNET API-key integration, replaced by the provider
abstraction in `src/services/providers/`.

**Why it was replaced**, not deleted outright: the file is the only record of how
the AGMARKNET dataset spells commodities and markets. If an authorised
data.gov.in provider is added later (`AgmarknetProvider implements
MarketPriceProvider`), that mapping is worth reading rather than rediscovering.

It is **not wired into anything** and is not loaded at runtime — the `.retired`
extension keeps it out of `require()` and out of the test glob.

Rows it wrote carry `source = 'AGMARKNET'`, which `marketPriceService.SOURCE`
retains as a legacy label so historical observations keep their original meaning.
No ingestion path produces that label any more.
