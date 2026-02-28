import mongoose from 'mongoose';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkUsers() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not configured');
    }
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection is not available');
    }
    const users = await db.collection('users').find().toArray();
    console.log('--- USERS IN HOSTELEASE DATABASE ---');
    users.forEach(u => console.log(` - _id: ${u._id}, registerId: ${u.registerId}, Name: ${u.name}`));
    await mongoose.disconnect();
}

checkUsers().catch(console.error);
