# https://github.com/viktorexe/terristats-discord-bot
from aiohttp import web
import asyncio
async def health_check(request):
    return web.Response(text="Bot is running", status=200)
async def start_web_server(port=8000):
    app = web.Application()
    app.router.add_get('/', health_check)
    app.router.add_get('/health', health_check)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    print(f"Web server started on port {port}")
