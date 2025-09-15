import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkLinksData() {
    try {
        const content = await prisma.pdfExtractedContent.findFirst({
            where: { 
                NOT: {
                    links: null
                }
            }
        });
        
        if (content) {
            console.log('Tipo dos links no banco:', typeof content.links);
            console.log('Links content:', content.links);
            
            // Tentar fazer parse se for string
            if (typeof content.links === 'string') {
                try {
                    const parsed = JSON.parse(content.links);
                    console.log('Parse bem-sucedido. É array?', Array.isArray(parsed));
                    console.log('Quantidade de links:', parsed.length);
                } catch (e) {
                    console.log('Erro no parse dos links:', e.message);
                }
            } else {
                console.log('Links já é um objeto:', Array.isArray(content.links));
            }
        } else {
            console.log('Nenhum conteúdo com links encontrado');
        }
    } catch (error) {
        console.error('Erro:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLinksData();