// src/__tests__/db/mongodb.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  // Запускаем in-memory MongoDB сервер
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test-intelligent-trails');
}, 60000);

afterAll(async () => {
  await client.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Очищаем коллекции перед каждым тестом
  const collections = await db.listCollections().toArray();
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
  }
});

describe('MongoDB Connection', () => {
  it('should connect to database', async () => {
    expect(client).toBeDefined();
    expect(db).toBeDefined();
  });

  it('should list collections', async () => {
    await db.createCollection('test');
    const collections = await db.listCollections().toArray();
    expect(collections.length).toBeGreaterThan(0);
  });
});

describe('Users Collection - CRUD Operations', () => {
  const usersCollection = () => db.collection('users');

  describe('CREATE (Insert)', () => {
    it('should insert a new user', async () => {
      const user = {
        email: 'test@example.com',
        password: 'hashedpassword123',
        name: 'Test User',
        createdAt: new Date(),
      };

      const result = await usersCollection().insertOne(user);
      expect(result.insertedId).toBeDefined();
      expect(result.acknowledged).toBe(true);
    });

    it('should not insert duplicate email', async () => {
      await usersCollection().createIndex({ email: 1 }, { unique: true });

      const user1 = {
        email: 'duplicate@example.com',
        password: 'pass1',
        name: 'User 1',
        createdAt: new Date(),
      };

      const user2 = {
        email: 'duplicate@example.com',
        password: 'pass2',
        name: 'User 2',
        createdAt: new Date(),
      };

      await usersCollection().insertOne(user1);

      await expect(usersCollection().insertOne(user2)).rejects.toThrow();
    });

    it('should insert user without optional fields', async () => {
      const user = {
        email: 'minimal@example.com',
        password: 'hashedpassword',
        createdAt: new Date(),
      };

      const result = await usersCollection().insertOne(user);
      expect(result.insertedId).toBeDefined();
    });
  });

  describe('READ (Find)', () => {
    beforeEach(async () => {
      await usersCollection().insertMany([
        { email: 'user1@example.com', password: 'pass1', name: 'User 1', createdAt: new Date() },
        { email: 'user2@example.com', password: 'pass2', name: 'User 2', createdAt: new Date() },
        { email: 'user3@example.com', password: 'pass3', name: 'User 3', createdAt: new Date() },
      ]);
    });

    it('should find user by email', async () => {
      const user = await usersCollection().findOne({ email: 'user1@example.com' });
      expect(user).toBeDefined();
      expect(user?.email).toBe('user1@example.com');
      expect(user?.name).toBe('User 1');
    });

    it('should find user by _id', async () => {
      const inserted = await usersCollection().insertOne({
        email: 'findme@example.com',
        password: 'pass',
        name: 'Find Me',
        createdAt: new Date(),
      });

      const user = await usersCollection().findOne({ _id: inserted.insertedId });
      expect(user).toBeDefined();
      expect(user?.email).toBe('findme@example.com');
    });

    it('should return null for non-existent user', async () => {
      const user = await usersCollection().findOne({ email: 'nonexistent@example.com' });
      expect(user).toBeNull();
    });

    it('should find all users', async () => {
      const users = await usersCollection().find({}).toArray();
      expect(users.length).toBe(3);
    });
  });

  describe('UPDATE', () => {
    let userId: ObjectId;

    beforeEach(async () => {
      const result = await usersCollection().insertOne({
        email: 'update@example.com',
        password: 'oldpass',
        name: 'Old Name',
        createdAt: new Date(),
      });
      userId = result.insertedId;
    });

    it('should update user name', async () => {
      const result = await usersCollection().updateOne(
        { _id: userId },
        { $set: { name: 'New Name' } }
      );

      expect(result.modifiedCount).toBe(1);
      expect(result.matchedCount).toBe(1);

      const user = await usersCollection().findOne({ _id: userId });
      expect(user?.name).toBe('New Name');
    });

    it('should update user password', async () => {
      const result = await usersCollection().updateOne(
        { _id: userId },
        { $set: { password: 'newhashedpassword' } }
      );

      expect(result.modifiedCount).toBe(1);

      const user = await usersCollection().findOne({ _id: userId });
      expect(user?.password).toBe('newhashedpassword');
    });

    it('should update multiple fields', async () => {
      const result = await usersCollection().updateOne(
        { _id: userId },
        { $set: { name: 'Updated Name', password: 'newpass' } }
      );

      expect(result.modifiedCount).toBe(1);

      const user = await usersCollection().findOne({ _id: userId });
      expect(user?.name).toBe('Updated Name');
      expect(user?.password).toBe('newpass');
    });

    it('should return 0 modified count for non-existent user', async () => {
      const fakeId = new ObjectId();
      const result = await usersCollection().updateOne(
        { _id: fakeId },
        { $set: { name: 'Should Not Update' } }
      );

      expect(result.modifiedCount).toBe(0);
      expect(result.matchedCount).toBe(0);
    });

    it('should not modify if update is same as current value', async () => {
      const result = await usersCollection().updateOne(
        { _id: userId },
        { $set: { name: 'Old Name' } }
      );

      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(0); // Не изменилось
    });
  });

  describe('DELETE', () => {
    let userId: ObjectId;

    beforeEach(async () => {
      const result = await usersCollection().insertOne({
        email: 'delete@example.com',
        password: 'pass',
        name: 'Delete Me',
        createdAt: new Date(),
      });
      userId = result.insertedId;
    });

    it('should delete user by _id', async () => {
      const result = await usersCollection().deleteOne({ _id: userId });
      expect(result.deletedCount).toBe(1);

      const user = await usersCollection().findOne({ _id: userId });
      expect(user).toBeNull();
    });

    it('should delete user by email', async () => {
      const result = await usersCollection().deleteOne({ email: 'delete@example.com' });
      expect(result.deletedCount).toBe(1);
    });

    it('should return 0 deleted count for non-existent user', async () => {
      const fakeId = new ObjectId();
      const result = await usersCollection().deleteOne({ _id: fakeId });
      expect(result.deletedCount).toBe(0);
    });

    it('should delete multiple users', async () => {
      await usersCollection().insertMany([
        { email: 'delete1@example.com', password: 'pass', name: 'Delete 1', createdAt: new Date() },
        { email: 'delete2@example.com', password: 'pass', name: 'Delete 2', createdAt: new Date() },
      ]);

      const result = await usersCollection().deleteMany({ email: { $regex: /^delete/ } });
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Routes Collection - CRUD Operations', () => {
  const routesCollection = () => db.collection('routes');
  let userId: ObjectId;

  beforeEach(async () => {
    userId = new ObjectId();
  });

  describe('CREATE (Insert)', () => {
    it('should insert a new route', async () => {
      const route = {
        userId: userId.toString(),
        name: 'Test Route',
        encodedRoute: 'encoded_data_here',
        metrics: {
          totalDistance: 5000,
          totalDuration: 3600,
          placesCount: 3,
        },
        startPoint: {
          type: 'address',
          value: 'Start Address',
          coords: [55.7558, 37.6173],
        },
        endPoint: {
          type: 'address',
          value: 'End Address',
          coords: [55.7558, 37.6173],
        },
        waypoints: [],
        categories: ['cafe', 'park'],
        transportModes: ['pedestrian'],
        isFavorite: false,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await routesCollection().insertOne(route);
      expect(result.insertedId).toBeDefined();
      expect(result.acknowledged).toBe(true);
    });

    it('should insert route with waypoints', async () => {
      const route = {
        userId: userId.toString(),
        name: 'Route with Waypoints',
        encodedRoute: 'encoded',
        metrics: { totalDistance: 1000, totalDuration: 600, placesCount: 2 },
        startPoint: { type: 'address', value: 'Start', coords: [0, 0] },
        endPoint: { type: 'address', value: 'End', coords: [1, 1] },
        waypoints: [
          { type: 'category', value: 'cafe', category: 'cafe' },
          { type: 'address', value: 'Middle Point' },
        ],
        categories: ['cafe'],
        transportModes: ['pedestrian'],
        isFavorite: false,
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await routesCollection().insertOne(route);
      expect(result.insertedId).toBeDefined();

      const inserted = await routesCollection().findOne({ _id: result.insertedId });
      expect(inserted?.waypoints.length).toBe(2);
    });
  });

  describe('READ (Find)', () => {
    beforeEach(async () => {
      await routesCollection().insertMany([
        {
          userId: userId.toString(),
          name: 'Route 1',
          encodedRoute: 'enc1',
          metrics: { totalDistance: 1000, totalDuration: 600, placesCount: 2 },
          startPoint: { type: 'address', value: 'Start 1', coords: [0, 0] },
          endPoint: { type: 'address', value: 'End 1', coords: [1, 1] },
          waypoints: [],
          categories: ['cafe'],
          transportModes: ['pedestrian'],
          isFavorite: true,
          tags: [],
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          userId: userId.toString(),
          name: 'Route 2',
          encodedRoute: 'enc2',
          metrics: { totalDistance: 2000, totalDuration: 1200, placesCount: 3 },
          startPoint: { type: 'address', value: 'Start 2', coords: [0, 0] },
          endPoint: { type: 'address', value: 'End 2', coords: [2, 2] },
          waypoints: [],
          categories: ['park'],
          transportModes: ['auto'],
          isFavorite: false,
          tags: ['tag1'],
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ]);
    });

    it('should find routes by userId', async () => {
      const routes = await routesCollection().find({ userId: userId.toString() }).toArray();
      expect(routes.length).toBe(2);
    });

    it('should find favorite routes', async () => {
      const routes = await routesCollection().find({
        userId: userId.toString(),
        isFavorite: true
      }).toArray();
      expect(routes.length).toBe(1);
      expect(routes[0].name).toBe('Route 1');
    });

    it('should find routes by category', async () => {
      const routes = await routesCollection().find({
        userId: userId.toString(),
        categories: 'cafe'
      }).toArray();
      expect(routes.length).toBe(1);
      expect(routes[0].name).toBe('Route 1');
    });

    it('should sort routes by date descending', async () => {
      const routes = await routesCollection()
        .find({ userId: userId.toString() })
        .sort({ createdAt: -1 })
        .toArray();

      expect(routes[0].name).toBe('Route 2');
      expect(routes[1].name).toBe('Route 1');
    });

    it('should limit and skip results', async () => {
      const routes = await routesCollection()
        .find({ userId: userId.toString() })
        .sort({ createdAt: -1 })
        .limit(1)
        .skip(0)
        .toArray();

      expect(routes.length).toBe(1);
      expect(routes[0].name).toBe('Route 2');
    });
  });

  describe('UPDATE', () => {
    let routeId: ObjectId;

    beforeEach(async () => {
      const result = await routesCollection().insertOne({
        userId: userId.toString(),
        name: 'Original Name',
        encodedRoute: 'enc',
        metrics: { totalDistance: 1000, totalDuration: 600, placesCount: 2 },
        startPoint: { type: 'address', value: 'Start', coords: [0, 0] },
        endPoint: { type: 'address', value: 'End', coords: [1, 1] },
        waypoints: [],
        categories: [],
        transportModes: ['pedestrian'],
        isFavorite: false,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      routeId = result.insertedId;
    });

    it('should update route name', async () => {
      const result = await routesCollection().updateOne(
        { _id: routeId, userId: userId.toString() },
        { $set: { name: 'Updated Name' } }
      );

      expect(result.modifiedCount).toBe(1);

      const route = await routesCollection().findOne({ _id: routeId });
      expect(route?.name).toBe('Updated Name');
    });

    it('should toggle favorite status', async () => {
      const result = await routesCollection().updateOne(
        { _id: routeId, userId: userId.toString() },
        { $set: { isFavorite: true } }
      );

      expect(result.modifiedCount).toBe(1);

      const route = await routesCollection().findOne({ _id: routeId });
      expect(route?.isFavorite).toBe(true);
    });

    it('should update tags', async () => {
      const result = await routesCollection().updateOne(
        { _id: routeId, userId: userId.toString() },
        { $set: { tags: ['new-tag', 'another-tag'] } }
      );

      expect(result.modifiedCount).toBe(1);

      const route = await routesCollection().findOne({ _id: routeId });
      expect(route?.tags).toEqual(['new-tag', 'another-tag']);
    });

    it('should not update route of different user', async () => {
      const differentUserId = new ObjectId();
      const result = await routesCollection().updateOne(
        { _id: routeId, userId: differentUserId.toString() },
        { $set: { name: 'Should Not Update' } }
      );

      expect(result.modifiedCount).toBe(0);
    });
  });

  describe('DELETE', () => {
    let routeId: ObjectId;

    beforeEach(async () => {
      const result = await routesCollection().insertOne({
        userId: userId.toString(),
        name: 'Delete Me',
        encodedRoute: 'enc',
        metrics: { totalDistance: 1000, totalDuration: 600, placesCount: 2 },
        startPoint: { type: 'address', value: 'Start', coords: [0, 0] },
        endPoint: { type: 'address', value: 'End', coords: [1, 1] },
        waypoints: [],
        categories: [],
        transportModes: ['pedestrian'],
        isFavorite: false,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      routeId = result.insertedId;
    });

    it('should delete route by _id and userId', async () => {
      const result = await routesCollection().deleteOne({
        _id: routeId,
        userId: userId.toString()
      });

      expect(result.deletedCount).toBe(1);

      const route = await routesCollection().findOne({ _id: routeId });
      expect(route).toBeNull();
    });

    it('should not delete route of different user', async () => {
      const differentUserId = new ObjectId();
      const result = await routesCollection().deleteOne({
        _id: routeId,
        userId: differentUserId.toString()
      });

      expect(result.deletedCount).toBe(0);
    });

    it('should delete all routes of user', async () => {
      await routesCollection().insertMany([
        {
          userId: userId.toString(),
          name: 'Route 2',
          encodedRoute: 'enc2',
          metrics: { totalDistance: 1000, totalDuration: 600, placesCount: 2 },
          startPoint: { type: 'address', value: 'Start', coords: [0, 0] },
          endPoint: { type: 'address', value: 'End', coords: [1, 1] },
          waypoints: [],
          categories: [],
          transportModes: ['pedestrian'],
          isFavorite: false,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await routesCollection().deleteMany({ userId: userId.toString() });
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Database Indexes', () => {
  it('should create unique index on users email', async () => {
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    const indexes = await usersCollection.indexes();
    const emailIndex = indexes.find(idx => idx.name === 'email_1');

    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(true);
  });

  it('should create compound index on routes', async () => {
    const routesCollection = db.collection('routes');
    await routesCollection.createIndex({ userId: 1, createdAt: -1 });

    const indexes = await routesCollection.indexes();
    const compoundIndex = indexes.find(idx => idx.name === 'userId_1_createdAt_-1');

    expect(compoundIndex).toBeDefined();
  });
});
