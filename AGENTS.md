# AGENTS.md — takos-excel

`takos-excel` は Takos distribution が ship し Takosumi 上で動く **1st-party
InstallableApp** (新規 space 作成時に auto-install される user-facing
convenience)。通常の AppInstallation entry として記録され、user は uninstall
できる。 spreadsheet editing / formula / cell calculation を提供する。

## 責務

### 持つ

- spreadsheet editing surface
- formula / cell calculation engine
- import / export (csv 等)

### 持たない

- Takos core service との直接 implementation 連携 (consumer 側として通常の
  AppInstallation flow を経由)

## Substitutability

代替実装可。 Takos distribution は default で auto-install するが、これは
architectural privilege ではない。独立 product として他の spreadsheet / formula
engine app に置き換え可能。

## 隣接 product との contract

- **Bundled app**: Takos distribution が新規 space 作成時に Takosumi 上へ
  auto-install する通常 AppInstallation
- **Upstream**: Takos public API
- **Independence**: 独立 product root として管理、 Takos core には吸収しない

## Workflow

```bash
cd takos-apps/takos-excel
deno task check
deno task test
deno task lint
deno task fmt:check
```
