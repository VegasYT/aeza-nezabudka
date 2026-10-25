# Design

## Context

- Палитры `gray` и `dark` в `shared/ui/theme/palettes.ts` перенастроены:
  - gray[0] почти белый;
  - dark[6] - цвет окон (`--nz-raised`);
  - dark[7] - цвет острова.

  Mantine строит `--mantine-color-gray-light*`, `--mantine-color-disabled`, `--mantine-color-{red,yellow}-light` и наведение пунктов списков и меню из этих оттенков. В тёмной теме это даёт почти чёрные квадраты при наведении, неактивные кнопки цвета окна и бурые предупреждения.
- `--input-bg` у всех полей - `--nz-inset`. В светлой теме он равен холсту, в тёмной - чёрный.
- У `Drawer` в теме нет настроек: листы берут фон `body` и обычный заголовок.
- Высоту 44 px на телефоне задают около 40 мест: пропсами `h`, флагами `tall` и `buttonHeight`, размерами `lg`/`xl`, классом `.phoneForm`.

## Decisions

1. **Цвета тёмной темы - в `tokens.ts`.** В тёмный блок добавляются:
   - `--mantine-color-gray-light` и `-hover` (полупрозрачный белый);
   - `--mantine-color-disabled` и `-border`;
   - `--mantine-color-red-light` = `--nz-danger-soft`, `--mantine-color-yellow-light` (полупрозрачный жёлтый);
   - `--mantine-color-placeholder` = `--nz-ink-3`;
   - тёмная дорожка `SegmentedControl`.

   В светлом блоке `--nz-hover` и `--nz-status-waiting` темнее, чтобы наведение и «Предстоит» были видны на белом. Наведение пунктов `Combobox` и `Menu`, крестика `CloseButton` и вид невыбранных `Radio` и `Checkbox` задаются классами в `theme.module.css` через `Component.extend` в `theme.ts`.
2. **Поле на холсте и на поверхности.** Новый токен `--nz-field`: по умолчанию `--mantine-color-default`, как у кнопок, а внутри `.island` и `.raised` - `--nz-inset`. Тема ставит `--input-bg: var(--nz-field)`. Поля в островах и окнах не меняются, поле «Отдел» в шапке «Платежей» выглядит как кнопка периода рядом.
3. **Листы и заголовки окон.** Класс заголовка окна (Exo прописными) переезжает в тему: `Modal.extend` и `Drawer.extend` получают `title`, а `Drawer` ещё и поверхность `raised`. Вызовы `classNames={dialogClassNames}` убираются, `dialogClassNames` удаляется. Окно даты оплаты и листы получают тот же заголовок, что остальные окна.
4. **Высота 44 px на телефоне - одно правило темы.** В `theme.module.css` под `@mixin smaller-than $mantine-breakpoint-sm` для `Button`, `ActionIcon`, `Input`, `CloseButton`, `SegmentedControl` и пунктов `Menu` переопределяются переменные размеров (`--button-height-*`, `--input-height-*`, `--ai-size-*`, `--cb-size-*`) и `min-height`. Классы вешаются через `Component.extend`. Пропсы `tall`, `buttonHeight`, `h={44}` и класс `.phoneForm` уходят, поведение на компьютере не меняется. Числовые размеры (`size={36}`) переменные не затрагивают, поэтому иконки-кнопки в строках переходят на размер темы `lg`.
   - Размеры `size={phone ? 'md' : 'sm'}` у полей «Журнала» и видов «Платежей» остаются: они меняют и кегль, а не только высоту.
   - Своё правило в модулях нужно только там, где это не компонент Mantine: ссылка логотипа и кнопка аккаунта в шапке.
   - Кнопка «Добавить …» в шапке раздела стала общей (`AddButton` в `@shared/ui/add-button`): на телефоне это квадратная «+» 44 px в строке заголовка, как уже было на «Платежах».
5. **Переполнение.**
   - `html { overflow-x: clip; }`: выпадающий список в выезжающем листе больше не расширяет страницу и не мигает.
   - Обёртки таблиц и календаря получают `position: relative`: `VisuallyHidden` с `position: absolute` больше не вырывается за них.
   - Названия переносятся (`min-width: 0; overflow-wrap: anywhere`).
6. **Общие хелперы.**
   - `@shared/api`: `getApiErrorMessage(error, fallback)` с текстом «Не удалось связаться с сервером…», `nextOffset`, `departmentsOptions()`.
   - `@shared/lib`:
     - `text` с `capitalize`;
     - `media` с `usePhone()`, брейкпоинт `sm` и чтение при первом рендере;
     - `form` с `fieldError`.
   - `@shared/lib/money`: `CURRENCIES`.
   - `@shared/auth`: `ROLE_LABELS`.
   - `@entities/recurring-payment`: `PaymentBadges` и `isPaymentMissing`.

   `StoppedBadge` принимает `stopped`, чтобы им пользовались и «Платежи».
7. **Сборка и загрузка.**
   - `"sideEffects": ["**/*.css"]` в `package.json`: маршруты берут `validate*Search` из `index.ts` страницы, и без этого флага Vite не может отделить страницу от главного чанка.
   - `beforeLoad` у `_authenticated` запускает загрузку `/settings` вместе с `/auth/me`.
   - Форма платежа на «Платежах» грузится лениво, только у администратора.

## Risks / Trade-offs

- [Правило 44 px задевает все кнопки `sm` на телефоне] → это и есть требование спецификаций. Вид на компьютере не меняется: правило живёт под брейкпоинтом.
- [`sideEffects` скрывает модуль с побочным эффектом без CSS] → в `src` такие импорты только у CSS и пакетов (проверено поиском). После сборки панель проверяется в браузере.
