import type { Messages } from './en'

/**
 * Ukrainian. Typed as `Messages`, so a key added to `en.ts` without a translation here is a compile
 * error — the English catalog can never silently leak through.
 *
 * Plurals go through `Intl.PluralRules('uk')`: Ukrainian inflects by one/few/many (1 учасник,
 * 2 учасники, 5 учасників — and 21 is `one` again), which no `n === 1` ternary can express.
 */

const cardinal = new Intl.PluralRules('uk')

function plural(n: number, one: string, few: string, many: string): string {
  const rule = cardinal.select(n)
  return rule === 'one' ? one : rule === 'few' ? few : many
}

export const uk: Messages = {
  common: {
    loading: 'Завантаження',
    cancel: 'Скасувати',
    remove: 'Вилучити',
    add: 'Додати',
    save: 'Зберегти',
    saved: 'Збережено.',
    retry: 'Повторити',
    tryAgain: 'Спробувати ще раз',
    discard: 'Відкинути',
    dismiss: 'Закрити',
    message: 'Написати',
    previous: 'Назад',
    next: 'Далі',
    loadMore: 'Показати ще',
    couldNotLoad: 'Не вдалося завантажити.',
  },

  errors: {
    generic: 'Щось пішло не так. Спробуйте ще раз.',
    offline: 'Схоже, ви офлайн.',
    badRequest: 'Запит недійсний.',
    sessionExpired: 'Ваш сеанс закінчився. Увійдіть знову.',
    forbidden: 'У вас немає доступу до цієї дії.',
    gone: 'Це вже недоступно.',
    conflict: 'Це конфліктує з тим, що вже існує.',
    fileTooLarge: 'Файл завеликий.',
    unsupportedFileType: 'Цей тип файлу не підтримується.',
    notAllowed: 'Ця дія тут неможлива.',
    tooManyRequests: 'Забагато запитів. Зачекайте хвилинку.',
    serverTrouble: 'На сервері негаразди. Спробуйте трохи пізніше.',
    badCredentials: 'Ці облікові дані не підійшли.',
    emailTaken: 'Обліковий запис із цією поштою вже існує.',
    signInFailed: 'Не вдалося увійти. Спробуйте ще раз.',
  },

  auth: {
    signInSubtitle: 'Увійдіть у свій обліковий запис.',
    email: 'Електронна пошта',
    password: 'Пароль',
    signIn: 'Увійти',
    noAccount: 'Немає облікового запису?',
    createOne: 'Створити',
    registerTitle: 'Створіть обліковий запис',
    registerSubtitle: 'Ви одразу ввійдете в систему.',
    firstName: 'Ім’я',
    lastName: 'Прізвище',
    confirmPassword: 'Підтвердьте пароль',
    passwordsMismatch: 'Паролі не збігаються.',
    createAccount: 'Створити обліковий запис',
    haveAccount: 'Уже маєте обліковий запис?',
  },

  theme: {
    label: 'Тема',
    system: 'Системна',
    light: 'Світла',
    dark: 'Темна',
    switchTo: (next) => (next === 'dark' ? 'Перемкнути на темну тему' : 'Перемкнути на світлу тему'),
  },

  language: {
    label: 'Мова',
    system: 'Системна',
  },

  nav: {
    chats: 'Чати',
    newGroup: 'Нова група',
    calls: 'Дзвінки',
    contacts: 'Контакти',
    openConversations: 'Відкрити розмови',
  },

  banner: {
    sessionEnded: 'Ваш сеанс завершився. Увійдіть знову, щоб продовжити спілкування.',
    connecting: 'З’єднання…',
    offline: 'Офлайн. Написані повідомлення надішлються, коли відновиться з’єднання.',
    queued: (n) => `${n} ${plural(n, 'повідомлення чекає', 'повідомлення чекають', 'повідомлень чекають')} на надсилання.`,
  },

  realtime: {
    wrongAccount: 'Цей сеанс належить іншому обліковому запису. Увійдіть знову.',
    serverRejected: 'Сервер відхилив запит.',
  },

  dialogs: {
    search: 'Пошук розмов',
    couldNotLoad: 'Не вдалося завантажити ваші розмови.',
    emptyTitle: 'Поки що немає розмов',
    emptyHint: 'Знайдіть когось у Контактах, щоб почати розмову.',
    openContacts: 'Відкрити контакти',
    noMatchesTitle: 'Нічого не знайдено',
    noMatchesHint: 'Тут немає нічого з такою назвою. Спробуйте менше літер.',
    group: 'Група',
    unknownUser: 'Невідомий користувач',
    members: (n) => `${n} ${plural(n, 'учасник', 'учасники', 'учасників')}`,
    membersWord: (n) => plural(n, 'учасник', 'учасники', 'учасників'),
    unread: (n) => `${n} ${plural(n, 'непрочитане', 'непрочитані', 'непрочитаних')}`,
    pickTitle: 'Виберіть розмову',
    pickHint: 'Виберіть розмову зі списку або знайдіть когось у Контактах, щоб почати нову.',
  },

  chat: {
    gone: 'Ця розмова більше недоступна.',
    couldNotLoadMessages: 'Не вдалося завантажити повідомлення.',
    emptyTitle: 'Поки що немає повідомлень',
    emptyHint: 'Напишіть щось, щоб почати.',
    queueFull: 'Забагато повідомлень чекають на надсилання. Зачекайте, поки відновиться з’єднання.',
    composerLabel: 'Повідомлення',
    composerPlaceholder: 'Напишіть повідомлення…',
    send: 'Надіслати',
    startVoiceCall: 'Почати голосовий дзвінок',
    startVideoCall: 'Почати відеодзвінок',
    seenBy: (n) => `Переглянули: ${n}`,
    typing: 'Друкує…',
    typingOne: (name) => `${name} друкує…`,
    typingMany: (n) => `${n} ${plural(n, 'людина друкує', 'людини друкують', 'людей друкують')}…`,
    online: 'У мережі',
    offline: 'Не в мережі',
    queuedMark: 'У черзі',
    notSentMark: 'Не надіслано',
    readMark: 'Прочитано',
    sentMark: 'Надіслано',
    notSent: 'Не надіслано.',
  },

  // Дієслова минулого часу мають рід, а стать автора невідома — тому «створив(-ла)», як у
  // системних повідомленнях більшості месенджерів.
  system: {
    someone: 'Хтось',
    someoneObject: 'когось',
    theGroup: 'групу',
    created: (actor, title) => `${actor} створив(-ла) «${title}»`,
    renamed: (actor, title) => `${actor} перейменував(-ла) групу на «${title}»`,
    memberAdded: (actor, target) => `${actor} додав(-ла) ${target}`,
    memberRemoved: (actor, target) => `${actor} вилучив(-ла) ${target}`,
    memberLeft: (actor) => `${actor} покинув(-ла) групу`,
    updated: (actor) => `${actor} оновив(-ла) розмову`,
  },

  contacts: {
    title: 'Контакти',
    findPeople: 'Пошук людей',
    searchPlaceholder: 'Ім’я або точна електронна адреса',
    typeMore: 'Введіть щонайменше два символи.',
    searchFailed: 'Пошук не вдався.',
    searchFailedRetry: 'Пошук не вдався. Спробуйте ще раз.',
    nobodyTitle: 'Нікого не знайдено',
    nobodyHint: 'Імена шукаються від початку; електронна адреса має бути точною.',
    couldNotLoad: 'Не вдалося завантажити ваші контакти.',
    emptyTitle: 'Поки що немає контактів',
    emptyHint: 'Скористайтеся пошуком вище, щоб знайти людей і додати їх.',
    page: (n) => `Сторінка ${n}`,
  },

  groups: {
    newGroup: 'Нова група',
    name: 'Назва групи',
    create: 'Створити групу',
    memberTally: (n, max) => `${n} з ${max} учасників.`,
    membersHeading: (n, max) => `Учасники (${n} з ${max})`,
    addMembers: 'Додати учасників',
    addPeople: 'Додати людей',
    addCount: (n) => (n > 0 ? `Додати ${n}` : 'Додати'),
    inGroup: 'У групі',
    rename: 'Перейменувати',
    backToChat: 'Назад до чату',
    leave: 'Покинути групу',
    delete: 'Видалити групу',
    deleteTitle: 'Видалити цю групу?',
    deleteBody: 'Розмову, її учасників і всі повідомлення в ній буде видалено для всіх. Цю дію не можна скасувати.',
    deleteConfirm: 'Видалити',
    owner: 'Власник',
    notAGroup: 'Це не групова розмова.',
    removePerson: (name) => `Вилучити ${name}`,
  },

  profile: {
    title: 'Ваш профіль',
    changePicture: 'Змінити фото',
    pictureHint: 'PNG, JPEG, WebP або GIF, до 1 МБ.',
    pictureTooLarge: 'Це фото більше за 1 МБ.',
    pictureUnsupported: 'Цей тип файлу не підтримується.',
    appearance: 'Вигляд',
    account: 'Обліковий запис',
    signOut: 'Вийти',
    signOutTitle: 'Вийти?',
    signOutBody: 'Ви впевнені, що хочете вийти?',
  },

  calls: {
    title: 'Дзвінки',
    emptyTitle: 'Поки що немає дзвінків',
    emptyHint: 'Почніть дзвінок із заголовка будь-якої розмови.',
    couldNotLoad: 'Не вдалося завантажити ваші дзвінки.',
    unknown: 'Невідомо',
    incoming: 'Вхідний',
    outgoing: 'Вихідний',
    groupWith: (n) => `Груповий дзвінок · ${n} ${plural(n, 'учасник', 'учасники', 'учасників')}`,
    groupYouStarted: (n) => `Груповий дзвінок, який ви почали · ${n} ${plural(n, 'учасник', 'учасники', 'учасників')}`,
    mediaLabel: (media) => (media === 'video' ? 'відео' : media === 'audio' ? 'голос' : media),
    statusLabel: (status) =>
      status === 'ringing'
        ? 'дзвонить'
        : status === 'answered'
          ? 'прийнято'
          : status === 'rejected'
            ? 'відхилено'
            : status === 'missed'
              ? 'пропущено'
              : status === 'ended'
                ? 'завершено'
                : status,

    call: 'Дзвінок',
    incomingCall: 'Вхідний дзвінок',
    groupCall: 'Груповий дзвінок',
    videoCall: 'Відеодзвінок',
    voiceCall: 'Голосовий дзвінок',
    answer: 'Відповісти',
    decline: 'Відхилити',
    muteMic: 'Вимкнути мікрофон',
    unmuteMic: 'Увімкнути мікрофон',
    cameraOff: 'Вимкнути камеру',
    cameraOn: 'Увімкнути камеру',
    leaveCall: 'Покинути дзвінок',
    hangUp: 'Завершити',
    yourCamera: 'Ваша камера',
    groupJoined: (n) => `Груповий дзвінок · приєдналися: ${n}`,
    waitingForOthers: 'Чекаємо, поки приєднаються інші…',
    ringing: 'Дзвонимо…',
    connecting: 'З’єднання…',
    waitingForVideo: 'Чекаємо на відео співрозмовника…',
    connected: 'З’єднано',

    couldNotReachServer: 'Не вдалося зв’язатися з сервером.',
    couldNotStart: 'Не вдалося почати дзвінок.',
    couldNotAnswer: 'Не вдалося відповісти на дзвінок.',
    couldNotJoin: 'Не вдалося приєднатися до дзвінка.',
    setupFailed: 'Не вдалося налаштувати дзвінок.',
    declined: 'Дзвінок відхилено.',
    ended: 'Дзвінок завершено.',
    theyHungUp: 'Співрозмовник завершив дзвінок.',
    noAnswer: 'Немає відповіді.',
    userBusy: 'Співрозмовник уже в іншому дзвінку.',
    callGone: 'Цей дзвінок більше недоступний.',
    notAParticipant: 'Ви не учасник цього дзвінка.',
    notConnected: 'Не вдалося з’єднати дзвінок.',
    connectionDropped: 'З’єднання розірвалося.',
    notAdmitted: 'Дзвінок не впустив цей пристрій.',

    mediaBlocked: 'Доступ до камери й мікрофона заблоковано. Дозвольте його в браузері, щоб дзвонити.',
    mediaMissing: 'Камеру чи мікрофон не знайдено.',
    mediaBusy: 'Вашу камеру чи мікрофон уже використовує інша програма.',
    mediaFailed: 'Не вдалося запустити камеру чи мікрофон.',
  },

  time: {
    today: 'Сьогодні',
    yesterday: 'Вчора',
    lastSeenAt: (time) => `востаннє в мережі о ${time}`,
    lastSeenYesterday: 'востаннє в мережі вчора',
    lastSeenOn: (date) => `востаннє в мережі ${date}`,
  },
}
