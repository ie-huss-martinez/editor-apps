# Architecture decision records

Significant decisions about this repository, one per file. An accepted record's decision isn't rewritten: a later record supersedes it, and says so. A small correction is made in place, and listed with its date under the record's "Amendments".

| Record                                        | Decision                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [0001](0001-one-repository-and-its-layout.md) | One public repository for the four editor apps, and its layout         |
| [0002](0002-app-shell-and-shared-look.md)     | One app shell, so the four apps look and behave alike                  |
| [0003](0003-testing-and-playwright.md)        | Test the app, not the SDK; Playwright in one pinned image              |
| [0004](0004-ci-deploys-and-review-tiers.md)   | CI on every pull request, deploys in Workers Builds, and review tiers  |
| [0005](0005-analytics-and-consent.md)         | Anonymous analytics through one adapter, and consent only where needed |
| [0006](0006-ads-in-an-isolated-origin.md)     | Ads only in a sandboxed frame from another origin                      |
| [0007](0007-the-ad-slot-contract.md)          | The ad slot: a fixed size now, a sandboxed frame later                 |
| [0008](0008-a-notes-app-and-its-sdk.md)       | A notes app for handwriting, backed by a new notes SDK                 |
| [0009](0009-offline-apps-with-a-service-worker.md) | Offline apps, with a service worker the build writes             |
| [0010](0010-editor-preferences-and-the-page-theme.md) | Editor preferences kept on the device, and the page's theme before first paint |
| [0011](0011-the-ad-slot-in-the-editors-column.md) | The ad slot in the editor's properties column |

Each record has a status, a date, the context, the decision, the alternatives considered and the consequences.
