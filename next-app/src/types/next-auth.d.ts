// src/types/next-auth.d.ts

import 'next-auth';

/** Способы входа в этом приложении (словарь SecuritySettings). */
export type AuthProvider = 'local' | 'yandex' | 'google' | 'github';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      /** Чем вошёл юзер: прокидывается из jwt callback (account.provider). */
      provider?: AuthProvider;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string;
    /** Сырое имя провайдера из account.provider ('credentials', 'yandex', ...). */
    provider?: string;
  }
}
