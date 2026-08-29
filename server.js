client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!acces') {
        const serverSursa = '1441514560493326490';

        try {
            const guildSursa = await client.guilds.fetch(serverSursa);

            // Verificăm dacă utilizatorul există pe serverul sursă
            const membruSursa = await guildSursa.members.fetch(message.author.id).catch(() => null);
            if (!membruSursa) {
                return message.reply('❌ Nu ai fost găsit pe serverul sursă.');
            }

            const membruDest = await message.guild.members.fetch(message.author.id);

            // Filtrăm rolul @everyone
            const roluriSursa = membruSursa.roles.cache.filter(role => role.name !== '@everyone');

            if (roluriSursa.size === 0) {
                return message.reply('❌ Nu ai niciun grad pe serverul sursă.');
            }

            const roluriDeAdaugat = [];

            for (const [id, rolSursa] of roluriSursa) {
                // Potrivire insensibilă la majuscule/minuscule
                const rolDest = message.guild.roles.cache.find(
                    r => r.name.toLowerCase() === rolSursa.name.toLowerCase()
                );

                // Verificăm dacă rolul există și dacă utilizatorul nu îl are deja
                if (rolDest && !membruDest.roles.cache.has(rolDest.id)) {
                    roluriDeAdaugat.push(rolDest);
                }
            }

            if (roluriDeAdaugat.length > 0) {
                // Adăugăm toate rolurile simultan
                await membruDest.roles.add(roluriDeAdaugat);
                const numeRoluri = roluriDeAdaugat.map(r => r.name).join(', ');
                message.reply(`✅ Ți-au fost oferite gradele: **${numeRoluri}**!`);
            } else {
                message.reply('❌ Nu am găsit grade noi pe acest server care să se potrivească.');
            }

        } catch (err) {
            console.error('Eroare comanda !acces:', err);
            message.reply(`❌ Eroare: ${err.message}`);
        }
    }
});
