// src/lib/auth/config.ts

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import YandexProvider from 'next-auth/providers/yandex';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '@/lib/db/mongodb';
import { usersRepo } from '@/lib/db/repositories/users';
import { getDb } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: MongoDBAdapter(clientPromise, {
    databaseName: 'intelligent-trails',
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    YandexProvider({
      clientId: process.env.YANDEX_CLIENT_ID!,
      clientSecret: process.env.YANDEX_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await usersRepo.verifyPassword(
            credentials.email as string,
            credentials.password as string
          );

          if (!user) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt', // JWT быстрее для Vercel
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;

        // Подтягиваем свежие данные из БД при каждом запросе сессии
        try {
          const db = await getDb();
          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ _id: new ObjectId(token.sub) });

          if (user) {
            session.user.name = user.name || session.user.name;
            session.user.email = user.email || session.user.email;
          }
        } catch (error) {
          console.error('Error fetching user data in session callback:', error);
        }
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
      }

      // При обновлении сессии (trigger === 'update'), обновляем данные в токене
      if (trigger === 'update' && token.sub) {
        try {
          const db = await getDb();
          const usersCollection = db.collection('users');
          const freshUser = await usersCollection.findOne({ _id: new ObjectId(token.sub) });

          if (freshUser) {
            token.name = freshUser.name;
            token.email = freshUser.email;
          }
        } catch (error) {
          console.error('Error updating token:', error);
        }
      }

      return token;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
});
