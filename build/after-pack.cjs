'use strict';
// Hook afterPack do electron-builder: reduz o .deb removendo arquivos do
// Electron que o Guardinha não usa.
//
// - locales/: mantém só pt-BR, pt-PT e en-US (fallback obrigatório do Chromium).
// - SwiftShader/Vulkan (libvk_swiftshader.so, libvulkan.so.1,
//   vk_swiftshader_icd.json): o app é DOM/CSS estático (formulários React),
//   sem WebGL.
//
// NUNCA remover libffmpeg.so: o binário do Electron declara DT_NEEDED nele,
// então o loader exige o arquivo na hora do exec; sem ele o app morre
// instantaneamente ("error while loading shared libraries: libffmpeg.so")
// mesmo o app não usando áudio/vídeo.
//
// Se o app um dia precisar de WebGL, rever a lista abaixo.
// Exportado nos dois formatos (module.exports + .default) porque o
// electron-builder pode carregar o hook via require() ou import().
const fs = require('node:fs');
const path = require('node:path');

const KEEP_LOCALES = new Set(['en-US.pak', 'pt-BR.pak', 'pt-PT.pak']);

const REMOVE_FILES = ['libvk_swiftshader.so', 'libvulkan.so.1', 'vk_swiftshader_icd.json'];

async function afterPack(context) {
  const dir = context.appOutDir;
  const removed = [];

  const localesDir = path.join(dir, 'locales');
  for (const entry of fs.readdirSync(localesDir)) {
    if (!KEEP_LOCALES.has(entry)) {
      fs.rmSync(path.join(localesDir, entry));
      removed.push(`locales/${entry}`);
    }
  }

  for (const file of REMOVE_FILES) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      fs.rmSync(full);
      removed.push(file);
    }
  }

  console.log(`[after-pack] removidos ${removed.length} arquivos não usados do Electron`);
}

module.exports = afterPack;
module.exports.default = afterPack;
