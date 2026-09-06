const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs');

async function build() {
    console.log('Начинаю сборку adblocker.bin с поддержкой YouTube...');

    // Расширенный список фильтров, содержащий скриптлеты и правила для YT
    const blocker = await ElectronBlocker.fromLists(fetch, [
        'https://easylist.to/easylist/easylist.txt',
        'https://easylist.to/easylist/easyprivacy.txt',
        'https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt',
        'https://easylist-downloads.adblockplus.org/easylistcookie.txt'
    ]);

    const buffer = blocker.serialize();
    fs.writeFileSync('adblocker.bin', Buffer.from(buffer));

    console.log(`Готово! Файл adblocker.bin создан.`);
    console.log(`Размер: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
}

build().catch(err => console.error('Ошибка сборки:', err));
