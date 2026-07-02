# https://github.com/viktorexe/terristats-discord-bot
import motor.motor_asyncio
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus
load_dotenv()
class Database:
    def __init__(self):
        mongo_uri = os.getenv('MONGO_URI')
        
        if mongo_uri and mongo_uri.startswith('mongodb'):
            self.client = motor.motor_asyncio.AsyncIOMotorClient(
                mongo_uri,
                maxPoolSize=5,
                minPoolSize=1
            )
        else:
            username = quote_plus(os.getenv('MONGO_USERNAME', ''))
            password = quote_plus(os.getenv('MONGO_PASSWORD', ''))
            host = os.getenv('MONGO_HOST', 'localhost')
            if username and password:
                mongo_uri = f"mongodb+srv://{username}:{password}@{host}/?retryWrites=true&w=majority"
            else:
                mongo_uri = f"mongodb://{host}:27017/"
            self.client = motor.motor_asyncio.AsyncIOMotorClient(
                mongo_uri,
                maxPoolSize=5,
                minPoolSize=1
            )
        self.db = self.client.terristats
    async def init_db(self):
        await self.db.test.insert_one({"test": "connection"})
        await self.db.test.delete_one({"test": "connection"})
        
        try:
            await self.db.clanwins.create_index("time", unique=True)
        except:
            pass
        try:
            await self.db.clanwins.create_index("clan_name")
        except:
            pass
        try:
            await self.db.clanwins.create_index("timestamp")
        except:
            pass
        try:
            await self.db.clanwins.create_index("clan_winners")
        except:
            pass
        try:
            await self.db.clanwins.create_index("map")
        except:
            pass
        try:
            await self.db.clanwins.create_index("contest")
        except:
            pass
        db_name = self.db.name
        collections = await self.db.list_collection_names()
        
        print(f"Database: '{db_name}'")
        print(f"Collections: {collections if collections else 'None'}")
        print(f"Database connection confirmed - Access granted to '{db_name}'")
        print(f"Clanwins scraper ready - monitoring territorial.io every second")

    async def close(self):
        self.client.close()

db = Database()
