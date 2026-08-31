/**
 * The reference catalog. Its inferred shape IS the `Messages` type, so every other catalog is
 * forced — at compile time — to carry exactly these keys with exactly these signatures. A missing
 * or extra translation is a type error, never a blank spot in the UI.
 *
 * An entry that varies with data is a function, so each language owns its own word order and its
 * own plural rules; the caller never concatenates around a translated fragment.
 */

export const en = {
  common: {
    loading: 'Loading',
    cancel: 'Cancel',
    remove: 'Remove',
    add: 'Add',
    save: 'Save',
    saved: 'Saved.',
    retry: 'Retry',
    tryAgain: 'Try again',
    discard: 'Discard',
    dismiss: 'Dismiss',
    message: 'Message',
    previous: 'Previous',
    next: 'Next',
    loadMore: 'Load more',
    couldNotLoad: 'Could not load this.',
  },

  errors: {
    generic: 'Something went wrong. Try again.',
    offline: 'You appear to be offline.',
    badRequest: 'That request was not valid.',
    sessionExpired: 'Your session has expired. Sign in again.',
    forbidden: 'You do not have access to do that.',
    gone: 'That is no longer available.',
    conflict: 'That conflicts with something that already exists.',
    fileTooLarge: 'That file is too large.',
    unsupportedFileType: 'That file type is not supported.',
    notAllowed: 'That action is not allowed here.',
    tooManyRequests: 'Too many requests. Wait a moment.',
    serverTrouble: 'The server is having trouble. Try again shortly.',
    badCredentials: 'Those credentials were not accepted.',
    emailTaken: 'An account with that email already exists.',
    signInFailed: 'Could not sign you in. Try again.',
  },

  auth: {
    signInSubtitle: 'Sign in to your account.',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    noAccount: 'No account?',
    createOne: 'Create one',
    registerTitle: 'Create your account',
    registerSubtitle: 'You will be signed in straight away.',
    firstName: 'First name',
    lastName: 'Last name',
    confirmPassword: 'Confirm password',
    passwordsMismatch: 'Those passwords do not match.',
    createAccount: 'Create account',
    haveAccount: 'Already have an account?',
  },

  theme: {
    label: 'Theme',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    switchTo: (next: 'light' | 'dark') => `Switch to ${next === 'dark' ? 'dark' : 'light'} theme`,
  },

  language: {
    label: 'Language',
    system: 'System',
  },

  nav: {
    chats: 'Chats',
    newGroup: 'New group',
    calls: 'Calls',
    contacts: 'Contacts',
    openConversations: 'Open conversations',
  },

  banner: {
    sessionEnded: 'Your session ended. Sign in again to keep chatting.',
    connecting: 'Connecting…',
    offline: 'Offline. Messages you write will send when the connection returns.',
    queued: (n: number) => `${n} ${n === 1 ? 'message' : 'messages'} waiting.`,
  },

  realtime: {
    wrongAccount: 'This session belongs to a different account. Sign in again.',
    serverRejected: 'The server rejected a request.',
  },

  dialogs: {
    search: 'Search conversations',
    couldNotLoad: 'Could not load your conversations.',
    emptyTitle: 'No conversations yet',
    emptyHint: 'Find someone in Contacts to start a conversation.',
    openContacts: 'Open contacts',
    noMatchesTitle: 'No matches',
    noMatchesHint: 'Nothing here is named like that. Try fewer letters.',
    group: 'Group',
    unknownUser: 'Unknown user',
    members: (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`,
    /** The word alone, for the header that keeps the number visible and hides the word below `sm`. */
    membersWord: (n: number): string => (n === 1 ? 'member' : 'members'),
    unread: (n: number) => `${n} unread`,
    pickTitle: 'Pick a conversation',
    pickHint: 'Pick one from your conversations, or find someone in Contacts to start a new one.',
  },

  chat: {
    gone: 'This conversation is no longer available.',
    couldNotLoadMessages: 'Could not load messages.',
    emptyTitle: 'No messages yet',
    emptyHint: 'Say something to get started.',
    queueFull: 'Too many messages are waiting to send here. Wait for the connection to come back.',
    composerLabel: 'Message',
    composerPlaceholder: 'Write a message…',
    send: 'Send',
    startVoiceCall: 'Start a voice call',
    startVideoCall: 'Start a video call',
    seenBy: (n: number) => `Seen by ${n}`,
    typing: 'Typing…',
    typingOne: (name: string) => `${name} is typing…`,
    typingMany: (n: number) => `${n} people are typing…`,
    online: 'Online',
    offline: 'Offline',
    queuedMark: 'Queued',
    notSentMark: 'Not sent',
    readMark: 'Read',
    sentMark: 'Sent',
    notSent: 'Not sent.',
  },

  /** System messages are composed client-side from ids (docs/MESSAGING.md §6) — so they localize. */
  system: {
    someone: 'Someone',
    someoneObject: 'someone',
    theGroup: 'the group',
    created: (actor: string, title: string) => `${actor} created "${title}"`,
    renamed: (actor: string, title: string) => `${actor} renamed the group to "${title}"`,
    memberAdded: (actor: string, target: string) => `${actor} added ${target}`,
    memberRemoved: (actor: string, target: string) => `${actor} removed ${target}`,
    memberLeft: (actor: string) => `${actor} left`,
    updated: (actor: string) => `${actor} updated the conversation`,
  },

  contacts: {
    title: 'Contacts',
    findPeople: 'Find people',
    searchPlaceholder: 'Name, or an exact email',
    typeMore: 'Type at least two characters.',
    searchFailed: 'Search failed.',
    searchFailedRetry: 'Search failed. Try again.',
    nobodyTitle: 'Nobody found',
    nobodyHint: 'Names match from the start; an email has to be exact.',
    couldNotLoad: 'Could not load your contacts.',
    emptyTitle: 'No contacts yet',
    emptyHint: 'Search above to find people and add them.',
    page: (n: number) => `Page ${n}`,
  },

  groups: {
    newGroup: 'New group',
    name: 'Group name',
    create: 'Create group',
    memberTally: (n: number, max: number) => `${n} of ${max} members.`,
    membersHeading: (n: number, max: number) => `Members (${n} of ${max})`,
    addMembers: 'Add members',
    addPeople: 'Add people',
    addCount: (n: number) => (n > 0 ? `Add ${n}` : 'Add'),
    inGroup: 'In group',
    rename: 'Rename',
    backToChat: 'Back to chat',
    leave: 'Leave group',
    delete: 'Delete group',
    deleteTitle: 'Delete this group?',
    deleteBody:
      'The conversation, its membership and every message in it are deleted for everyone. This cannot be undone.',
    deleteConfirm: 'Delete',
    owner: 'Owner',
    notAGroup: 'This is not a group conversation.',
    removePerson: (name: string) => `Remove ${name}`,
  },

  profile: {
    title: 'Your profile',
    changePicture: 'Change picture',
    pictureHint: 'PNG, JPEG, WebP or GIF, up to 1 MB.',
    pictureTooLarge: 'That picture is larger than 1 MB.',
    pictureUnsupported: 'That file type is not supported.',
    appearance: 'Appearance',
    account: 'Account',
    signOut: 'Sign out',
    signOutTitle: 'Sign out?',
    signOutBody: 'Are you sure you want to sign out?',
  },

  calls: {
    title: 'Calls',
    emptyTitle: 'No calls yet',
    emptyHint: 'Start one from the header of any conversation.',
    couldNotLoad: 'Could not load your calls.',
    unknown: 'Unknown',
    incoming: 'Incoming',
    outgoing: 'Outgoing',
    groupWith: (n: number) => `Group call · ${n} people`,
    groupYouStarted: (n: number) => `Group call you started · ${n} people`,
    /** Wire enums with a tolerant fallback — the server may add values (CLAUDE.md invariant 5). */
    mediaLabel: (media: string) => (media === 'video' ? 'video' : media === 'audio' ? 'voice' : media),
    statusLabel: (status: string) =>
      status === 'ringing'
        ? 'ringing'
        : status === 'answered'
          ? 'answered'
          : status === 'rejected'
            ? 'declined'
            : status === 'missed'
              ? 'missed'
              : status === 'ended'
                ? 'ended'
                : status,

    call: 'Call',
    incomingCall: 'Incoming call',
    groupCall: 'Group call',
    videoCall: 'Video call',
    voiceCall: 'Voice call',
    answer: 'Answer',
    decline: 'Decline',
    muteMic: 'Mute microphone',
    unmuteMic: 'Unmute microphone',
    cameraOff: 'Turn camera off',
    cameraOn: 'Turn camera on',
    leaveCall: 'Leave the call',
    hangUp: 'Hang up',
    yourCamera: 'Your camera',
    groupJoined: (n: number) => `Group call · ${n} joined`,
    waitingForOthers: 'Waiting for others to join…',
    ringing: 'Ringing…',
    connecting: 'Connecting…',
    waitingForVideo: 'Waiting for their video…',
    connected: 'Connected',

    couldNotReachServer: 'Could not reach the server.',
    couldNotStart: 'Could not start the call.',
    couldNotAnswer: 'Could not answer the call.',
    couldNotJoin: 'Could not join the call.',
    setupFailed: 'The call could not be set up.',
    declined: 'Call declined.',
    ended: 'Call ended.',
    theyHungUp: 'They hung up.',
    noAnswer: 'No answer.',
    userBusy: 'They are already on another call.',
    callGone: 'That call is no longer available.',
    notAParticipant: 'You are not part of that call.',
    notConnected: 'The call could not be connected.',
    connectionDropped: 'The connection dropped.',
    notAdmitted: 'The call did not admit this device.',

    mediaBlocked: 'Camera and microphone access was blocked. Allow it in your browser to call.',
    mediaMissing: 'No camera or microphone was found.',
    mediaBusy: 'Your camera or microphone is already in use by another app.',
    mediaFailed: 'Could not start your camera or microphone.',
  },

  time: {
    today: 'Today',
    yesterday: 'Yesterday',
    lastSeenAt: (time: string) => `last seen at ${time}`,
    lastSeenYesterday: 'last seen yesterday',
    lastSeenOn: (date: string) => `last seen ${date}`,
  },
} satisfies MessagesShape

/**
 * Every catalog is this shape. Derived from `en` (the messages themselves), constrained only
 * loosely here so `satisfies` still catches a value that is neither a string nor a function.
 */
type MessagesShape = {
  [section: string]: { [key: string]: string | ((...args: never[]) => string) }
}

export type Messages = typeof en
