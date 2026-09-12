const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs');

const FILTER_URLS = [
    'https://easylist.to/easylist/easylist.txt',
    'https://easylist.to/easylist/easyprivacy.txt',
    'https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt',
];

async function build() {
    console.log('Начинаю сборку adblocker.bin с поддержкой YouTube...');

    const blocker = await ElectronBlocker.fromLists(fetch, FILTER_URLS);

    const buffer = blocker.serialize();
    fs.writeFileSync('adblocker.bin', Buffer.from(buffer));
    console.log(`Файл adblocker.bin создан. Размер: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    console.log('Скачиваю и объединяю фильтры для Android (android-filters.txt)...');
    let combinedFilters = '';
    for (const url of FILTER_URLS) {
        try {
            console.log(`Загрузка: ${url}`);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const text = await res.text();
            combinedFilters += `\n! --- Source: ${url} ---\n` + text;
        } catch (err) {
            console.error(`Не удалось скачать ${url}:`, err.message);
        }
    }

    fs.writeFileSync('android-filters.txt', combinedFilters, 'utf-8');
    console.log(`Файл android-filters.txt успешно создан. Размер: ${(Buffer.byteLength(combinedFilters) / 1024 / 1024).toFixed(2)} MB`);
    console.log('Готово!');
}

build().catch(err => {
    console.error('Ошибка сборки:', err);
    process.exit(1);
});
