# 素材与许可说明（CREDITS）

这个项目里**代码与设计全部自研**，只有地球影像是第三方素材，按许可要求署名如下。

## 地球影像贴图

- **来源**：Solar System Scope — https://www.solarsystemscope.com/textures/
- **许可**：Creative Commons Attribution 4.0 International（CC BY 4.0）
- **许可全文**：https://creativecommons.org/licenses/by/4.0/
- **用到的文件**：`8k_earth_daymap` / `8k_earth_nightmap` / `8k_earth_clouds` / `8k_earth_normal_map` / `8k_earth_specular_map`
- **本项目的处理**：下载原图后，按站点体积需要缩放到 2K 档：日景 / 夜景 / 法线 / 高光 2048×1024，云层 1024×512；云层把亮度转成 alpha 通道，其余只做重采样，未做内容修改。
- **署名位置**：入口页页脚（`index.html`）、本文件、README。

> 也就是说：如果你只是自己看、自己改，保留这行署名就完全合规；
> **如果要商用或上线，请把 `vendor/textures/` 里的地球贴图整套换成你自己拥有授权的素材**，代码不需要改动。

## 其他

| 组件 | 许可 |
| --- | --- |
| three.js r160（`vendor/build/three.module.js`） | MIT — https://github.com/mrdoob/three.js |
| 页面代码（`index.html` / `css/` / `js/`） | 你拥有，可自由修改 |
| 星空粒子、大气、涟漪等着色器 | 本项目原创 |

## 第三方工具（仅 `tools/` 目录用到，不属于页面运行时）

- 抓取/回放/截图工具基于 Chrome DevTools Protocol 自实现，无 npm 依赖。
- 贴图缩放使用 Python + Pillow（PIL License）。


## 星云与银河（公有领域）

- **星云**：NASA / STScI / Webb — Carina Nebula（JWST NIRCam），来源 images.nasa.gov
  许可：NASA 图像属**公有领域**，可自由使用；本站在此署名以示来源。
  处理：`assets/img/nebula.webp` —— 压红、抬蓝、压暗至 38%、高斯柔化 1.8px、宽 1800px。
- **银河带**：NASA / JPL-Caltech — GLIMPSE the Galaxy All the Way Around，来源 images.nasa.gov
  处理：`assets/img/milkyway.webp` —— 偏冷、压暗至 34%、柔化 2.4px、宽 1600px。

> 这两张只用作页面背景氛围层（不透明度 0.34 / 0.34，`mix-blend-mode: screen`），不承载信息。
