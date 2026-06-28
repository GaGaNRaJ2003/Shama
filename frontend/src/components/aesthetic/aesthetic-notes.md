# Aesthetic Component Setup

These local components connect Shama to the requested inspiration repos:

- `ShaderBackdrop.tsx`: uses `@shadergradient/react` from `ruucm/shadergradient`.
- `LiquidLogoMark.tsx`: uses `@paper-design/shaders-react`, the reusable shader package behind `paper-design/liquid-logo`.
- `LiquidGlassPanel.tsx`: React wrapper for Apple-style liquid glass surfaces inspired by `dashersw/liquid-glass-js`; `html2canvas` is installed for future page-sampling/refraction work.
- `MehfilScene.tsx`: uses `@react-three/fiber` and `three` from `pmndrs/react-three-fiber`.

Sources:
- https://github.com/ruucm/shadergradient
- https://github.com/paper-design/liquid-logo
- https://github.com/dashersw/liquid-glass-js
- https://github.com/pmndrs/react-three-fiber
