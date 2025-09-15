// Teste do parser POSTCOPY
const testPostcopy = "HL: Descontos em kits por tempo limitadoCOPY: Chegou a hora. Aproveite ofertas com kits exclusivos de acessórios de ponta por tempo limitado.  #Windows11HomeDESCRIPTION: Otimize seu trabalho, ouse na criatividade. Kits de PCs + acessórios com descontos especiais.CTA: Comprar agora";

function parsePostcopy(postcopyText) {
    // Remover prefixo POSTCOPY se existir
    const cleanText = postcopyText.replace(/^POSTCOPY:\s*/i, '').trim();
    
    // Padrões conhecidos de campos do POSTCOPY
    const fieldPatterns = ['HL:', 'COPY:', 'DESCRIPTION:', 'CTA:', 'HEADLINE:', 'DESC:'];
    
    const parsed = {};
    const textToProcess = cleanText;
    
    // Processar cada campo conhecido
    fieldPatterns.forEach(pattern => {
        const regex = new RegExp(`\\b${pattern.replace(':', '')}:\\s*([^]*?)(?=\\b(?:${fieldPatterns.map(p => p.replace(':', '')).join('|')}):|$)`, 'i');
        const match = textToProcess.match(regex);
        
        if (match) {
            const key = pattern.replace(':', '').toUpperCase();
            const value = match[1].trim();
            parsed[key] = value;
        }
    });
    
    return parsed;
}

const result = parsePostcopy(testPostcopy);
console.log('Resultado do parse:');
console.log(JSON.stringify(result, null, 2));
console.log('Campos encontrados:', Object.keys(result).length);