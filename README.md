# DIICOT Reports

1. Copiază `.env.example` în `.env`.
2. Completează `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` și schimbă `SESSION_SECRET`.
3. În Discord Developer Portal > OAuth2 > Redirects adaugă exact: `http://localhost:3000/auth/discord/callback`.
4. Asigură-te că botul este deja pe serverul Discord.
5. Rulează `npm install`, apoi `npm start`.
6. Deschide `http://localhost:3000`.

Botul nu are nevoie de Administrator pentru această versiune. Backend-ul folosește tokenul botului ca să verifice rolurile membrului pe server.

Conducere configurată: Coordonator, Procuror, Procuror Șef Adjunct, Procuror Șef.
