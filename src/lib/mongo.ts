import { MongoClient, Db } from "mongodb";

const globalForMongo = globalThis as unknown as {
  mongoClient?: Promise<MongoClient>;
};

const clientPromise =
  globalForMongo.mongoClient ?? new MongoClient(process.env.MONGO_URI!).connect();

if (process.env.NODE_ENV !== "production") globalForMongo.mongoClient = clientPromise;

export async function getMongoDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(process.env.MONGO_DB);
}
