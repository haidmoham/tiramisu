# Cursor and touch prior art

tiramisu uses a **chromatic contact field**: a cursor-driven metaball toy on fine pointers and a larger touch deformation that briefly decays after release or native-scroll cancellation. The native cursor and native scrolling remain intact.

The implementation riffs on established patterns rather than copying a complete effect:

- [mouse-animations](https://github.com/tgomilar/mouse-animations) — minimal cursor spotlight and short-trail primitives (MIT).
- [Interactive Particles with Three.js](https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/) — pointer/touch field architecture and GPU-fed trail ideas; tiramisu does not reproduce the particle spectacle.
- [Amanda Ghassaei's Fluid Simulation](https://github.com/amandaghassaei/FluidSimulation) — pigment decay and gesture-force reference (MIT), without adopting a full fluid solver.
- [PavelDoGreat WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) — restrained color-mixing reference (MIT), without bloom, sunrays, or continuous simulation.
- [Codrops animated custom cursor](https://tympanus.net/codrops/2021/02/18/creating-an-animated-custom-cursor-with-svg-filters/) — lagging outer-contour reference while preserving the native cursor.
- [threejs-cursor-trail](https://github.com/heinergiehl/threejs-cursor-trail) — touch support and resource-pooling reference (MIT), without particle trails.

Guardrails: no flashing, pulsing, rapid hue cycling, speed-driven brightness, particle bursts, long trails, text distortion, or scroll interception. Reduced motion removes smoothing and residual decay while preserving a quiet active-contact indicator.
