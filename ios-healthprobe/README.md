# HealthProbe

Tiny test app: can a sideloaded build (SideStore / LiveContainer, free
Apple ID) read Apple Health? Built by `.github/workflows/ios-healthprobe.yml`
on a GitHub macOS runner into an unsigned IPA whose HealthKit entitlement is
embedded with an ad-hoc signature, so the sideloader can see it and request it.

If it works, "Send" pushes the last 7 days to `/api/v1/apple-health`
(same as the Shortcut). If it doesn't, step 1 reports the missing entitlement.
