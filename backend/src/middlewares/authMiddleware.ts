import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): any {
    // Busca a chave no cabeçalho. O mais comum é usar 'x-api-key' ou 'Authorization: Bearer ...'
    // Vamos checar ambos para máxima compatibilidade com o ServiceNow
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;

    let providedKey = '';

    if (apiKeyHeader) {
        providedKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
        providedKey = authHeader.substring(7, authHeader.length);
    }

    const expectedKey = process.env.API_SECRET_KEY;

    // Se não tivermos uma chave configurada no servidor, podemos optar por bloquear tudo ou liberar tudo.
    // Como queremos segurança, vamos avisar que o servidor está mal configurado.
    if (!expectedKey) {
        console.warn('[AUTH] Aviso: API_SECRET_KEY não está configurada no .env!');
        return res.status(500).json({ error: 'Erro de configuração do servidor de autenticação.' });
    }

    if (!providedKey || providedKey !== expectedKey) {
        console.warn(`[AUTH] Tentativa de acesso bloqueada. Chave inválida ou não fornecida.`);
        return res.status(401).json({ error: 'Unauthorized. API Key inválida ou ausente.' });
    }

    // Se a chave bateu, libera a rota
    next();
}
