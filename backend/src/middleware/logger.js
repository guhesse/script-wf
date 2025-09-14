// src/middleware/logger.js
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;

    // Override res.send to log response time
    res.send = function(data) {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        originalSend.call(this, data);
    };

    console.log(`📥 ${req.method} ${req.originalUrl} - IP: ${req.ip || req.connection.remoteAddress}`);
    next();
};

export const errorHandler = (error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);

    // Não expor stack trace em produção
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
        ...(isDevelopment && { stack: error.stack })
    });
};
