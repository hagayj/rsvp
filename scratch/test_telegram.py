import asyncio
import os
from telethon import TelegramClient
from dotenv import load_dotenv

load_dotenv('.env.local')

async def main():
    api_id = os.environ.get('TELEGRAM_API_ID')
    api_hash = os.environ.get('TELEGRAM_API_HASH')
    phone = '+972509505548'
    
    print(f"Testing Telegram connection with API_ID: {api_id}")
    client = TelegramClient('test_session', int(api_id), api_hash)
    
    try:
        await client.connect()
        print("Connected to Telegram.")
        
        if not await client.is_user_authorized():
            print(f"Requesting code for {phone}...")
            await client.send_code_request(phone)
            print("✅ Code sent successfully!")
        else:
            print("✅ Already authorized!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
