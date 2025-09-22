import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Express } from 'express';
import { PrismaService } from '../database/prisma.service';
import { BunnyStorageService } from '../../services/bunny-storage.service';
import imageSize from 'image-size';
import { CreateMasterDto } from './dto/create-master.dto';
import { UpdateMasterDto, ListMastersQueryDto } from './dto/update-master.dto';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

@Injectable()
export class MastersService {
    private readonly logger = new Logger(MastersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly bunny: BunnyStorageService,
    ) { }

    async create(data: CreateMasterDto) {
        // Calcular aspectRatio se não veio e há width/height
        let aspectRatio = data.aspectRatio;
        if (!aspectRatio && data.width && data.height) {
            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
            const g = gcd(data.width, data.height);
            aspectRatio = `${data.width / g}:${data.height / g}`;
        }
        const created = await this.prisma.masterAsset.create({
            data: {
                ...data,
                aspectRatio,
                tags: data.tags || [],
            },
        });
        return this.sanitize(created);
    }

    async findAll(query: ListMastersQueryDto) {
        const {
            search,
            brand,
            fileType,
            editableType,
            tag,
            tagsAny,
            tagsAll,
            page = 1,
            pageSize = 20,
        } = query;

        const where: Prisma.MasterAssetWhereInput = {};

        if (brand) where.brand = { equals: brand, mode: 'insensitive' };
        if (fileType) where.fileType = fileType as any;
        if (editableType) where.editableType = editableType as any;
        if (tag) where.tags = { has: tag };
        if (tagsAny) {
            const list = tagsAny.split(',').map((t) => t.trim()).filter(Boolean);
            if (list.length) where.tags = { hasSome: list };
        }
        if (tagsAll) {
            const list = tagsAll.split(',').map((t) => t.trim()).filter(Boolean);
            if (list.length) where.tags = { hasEvery: list };
        }

        if (search) {
            const s = search.trim();
            where.AND = [
                {
                    OR: [
                        { title: { contains: s, mode: 'insensitive' } },
                        { fileName: { contains: s, mode: 'insensitive' } },
                        { brand: { contains: s, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        const skip = (page - 1) * pageSize;
        const [rawItems, total] = await Promise.all([
            this.prisma.masterAsset.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.masterAsset.count({ where }),
        ]);
        const items = rawItems.map(i => this.sanitize(i));

        return {
            success: true,
            items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }

    async findOne(id: string) {
        const asset = await this.prisma.masterAsset.findUnique({ where: { id } });
        if (!asset) throw new NotFoundException('Master não encontrado');
        return { success: true, asset: this.sanitize(asset) };
    }

    async update(id: string, data: UpdateMasterDto) {
        await this.ensureExists(id);
        if (data.width && data.height && !data.aspectRatio) {
            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
            const g = gcd(data.width, data.height);
            (data as any).aspectRatio = `${data.width / g}:${data.height / g}`;
        }
        const updated = await this.prisma.masterAsset.update({ where: { id }, data });
        return { success: true, asset: this.sanitize(updated) };
    }

    async archive(id: string) {
        await this.ensureExists(id);
        const updated = await this.prisma.masterAsset.update({
            where: { id },
            data: { isActive: false, archivedAt: new Date() },
        });
        return { success: true, asset: this.sanitize(updated) };
    }

    /**
     * Upload de arquivo binário para Bunny e registro do MasterAsset
     */
    async uploadAndRegister(params: {
        file: { originalname: string; buffer: Buffer; mimetype: string; size: number };
        title?: string;
        brand?: string;
        editableType?: string;
        tags?: string; // CSV
        subfolder?: string;
        previewBase64?: string; // data:image/png;base64,...
        description?: string;
    }) {
        if (!params.file) {
            return { success: false, error: 'Arquivo não enviado (campo file)' };
        }

        const originalName = params.file.originalname;
        const ext = (originalName.split('.').pop() || '').toLowerCase();
        const fileTypeMap: Record<string, string> = {
            psd: 'PSD', ai: 'AI', indd: 'INDD', xd: 'XD', fig: 'FIGMA', figma: 'FIGMA', pdf: 'PDF', jpg: 'JPG', jpeg: 'JPG', png: 'PNG', mp4: 'MP4'
        };
        const fileType = (fileTypeMap[ext] || 'OTHER') as any;

        // ==========================
        // Checksum & Deduplicação
        // ==========================
        let checksum: string | undefined;
        try {
            checksum = createHash('sha256').update(params.file.buffer).digest('hex');
        } catch (e) {
            this.logger.warn('Falha ao gerar checksum do arquivo');
        }

        if (checksum) {
            const normalizedBrand = params.brand ? params.brand.toLowerCase() : null;
            const sameChecksum = await this.prisma.masterAsset.findMany({ where: { checksum } });
            if (sameChecksum.length) {
                const exact = sameChecksum.find(a => a.fileName === originalName && (a.brand || null) === normalizedBrand);
                if (exact) {
                    this.logger.log(`Upload deduplicado (checksum+nome+brand). id=${exact.id}`);
                    return { success: true, duplicated: true, asset: this.sanitize(exact) };
                }
                // Mesmo checksum, mas nome/brand diferentes => nova versão
                const newVersion = Math.max(...sameChecksum.map(a => a.version || 1)) + 1;
                (params as any).__forcedVersion = newVersion;
            } else {
                // Legacy: procurar registro sem checksum que bata por fileName+fileSize+brand
                const legacy = await this.prisma.masterAsset.findFirst({
                    where: {
                        checksum: null,
                        fileName: originalName,
                        fileSize: BigInt(params.file.size),
                        OR: [
                            { brand: params.brand || null },
                            { brand: null }
                        ]
                    }
                });
                if (legacy) {
                    const updated = await this.prisma.masterAsset.update({ where: { id: legacy.id }, data: { checksum } });
                    this.logger.log(`Consolidando asset legacy sem checksum id=${legacy.id}`);
                    return { success: true, duplicated: true, asset: this.sanitize(updated) };
                }
            }
        }

        // Detectar dimensões se imagem + gerar preview reduzido
        let width: number | undefined;
        let height: number | undefined;
        let previewBuffer: Buffer | undefined;
        let previewExt = 'jpg';
        try {
            if (['jpg', 'jpeg', 'png'].includes(ext)) {
                const dim = imageSize(params.file.buffer);
                width = dim.width;
                height = dim.height;
                // Gerar preview simples (redução) usando canvas (já existe dependência 'canvas')
                // Evitar adicionar lib pesada agora. Fallback: usar a própria imagem se <= 400kb
                if (params.file.size <= 400 * 1024) {
                    previewBuffer = params.file.buffer; // reutiliza
                    previewExt = ext === 'png' ? 'png' : 'jpg';
                }
            }
        } catch (e) {
            this.logger.warn('Não foi possível extrair dimensões da imagem');
        }

        // Construir caminho
        const storagePath = this.bunny.buildStoragePath({
            brand: params.brand,
            subfolder: params.subfolder,
            fileName: originalName,
        });

        const uploadRes = await this.bunny.uploadBuffer(storagePath, params.file.buffer, params.file.mimetype);
        if (!uploadRes.success) {
            return { success: false, error: uploadRes.error || 'Falha no upload Bunny' };
        }

        // Se previewBase64 enviado, prioriza sobre previewBuffer gerado
        if (params.previewBase64 && /^data:image\/(png|jpe?g);base64,/i.test(params.previewBase64)) {
            try {
                const m = params.previewBase64.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
                if (m) {
                    previewExt = m[1].toLowerCase().startsWith('png') ? 'png' : 'jpg';
                    previewBuffer = Buffer.from(m[2], 'base64');
                }
            } catch (e) {
                this.logger.warn('previewBase64 inválido, ignorando');
            }
        }

        // Upload preview, se gerada ou enviada
        let previewImageUrl: string | undefined;
        if (previewBuffer) {
            const normalized = storagePath.replace(/\\/g, '/');
            const previewPath = normalized.replace(/([^/]+)$/, (m) => `preview_${m.split('.')[0]}.${previewExt}`);
            const prevUpload = await this.bunny.uploadBuffer(previewPath, previewBuffer, previewExt === 'png' ? 'image/png' : 'image/jpeg');
            if (prevUpload.success) {
                previewImageUrl = prevUpload.cdnUrl;
            }
        }

        // Criar registro
        // Normalização de brand e tags permitidos
        const allowedBrands = ['dell', 'alienware'];
        const normalizedBrand = params.brand ? params.brand.toLowerCase() : undefined;
        const brandFinal = normalizedBrand && allowedBrands.includes(normalizedBrand) ? normalizedBrand : null;
        const allowedTags = this.getMeta().tags;
        const incomingTags = params.tags ? Array.from(new Set(params.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))) : [];
        const filteredTags = incomingTags.filter(t => allowedTags.includes(t));

        const created = await this.prisma.masterAsset.create({
            data: {
                title: params.title || originalName,
                brand: brandFinal,
                fileName: originalName,
                fileType,
                editableType: (params.editableType || 'STATIC') as any,
                fileSize: BigInt(params.file.size),
                width,
                height,
                bunnyPath: uploadRes.storagePath!,
                bunnyCdnUrl: uploadRes.cdnUrl!,
                checksum,
                previewImageUrl,
                tags: filteredTags,
                description: params.description?.substring(0, 2000) || null,
                aspectRatio: (!params.file ? undefined : (width && height ? (() => { const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b); const g = gcd(width!, height!); return `${width! / g}:${height! / g}`; })() : undefined)),
                version: (params as any).__forcedVersion || 1,
            }
        });
        return { success: true, asset: this.sanitize(created) };
    }

    /**
     * Converte campos BigInt em number/string para evitar erro de JSON serialization
     */
    private sanitize(asset: any) {
        if (!asset || typeof asset !== 'object') return asset;
        const out: any = { ...asset };
        // fileSize BigInt → number (fallback para string se muito grande)
        if (typeof out.fileSize === 'bigint') {
            const asNumber = Number(out.fileSize);
            out.fileSize = Number.isSafeInteger(asNumber) ? asNumber : out.fileSize.toString();
        }
        return out;
    }

    async ensureExists(id: string) {
        const exists = await this.prisma.masterAsset.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException('Master não encontrado');
    }

        getMeta() {
            return {
                brands: ['dell', 'alienware'],
                tags: [
                    'social','campaign','keyvisual','template','evergreen','video','print','adapt','master','layout','draft'
                ]
            };
        }

        /**
         * Consolida duplicados existentes (sem checksum) mantendo o mais antigo por (fileName,fileSize,brand)
         * e arquivando os demais. Retorna relatório com grupos afetados.
         */
        async consolidateDuplicates() {
            const all = await this.prisma.masterAsset.findMany({ where: { checksum: null } });
            const groups = new Map<string, any[]>();
            for (const a of all) {
                const key = `${a.fileName}|${a.fileSize.toString()}|${a.brand || ''}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(a);
            }
            const report: any[] = [];
            for (const [key, arr] of groups.entries()) {
                if (arr.length < 2) continue;
                const sorted = arr.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
                const keeper = sorted[0];
                const duplicates = sorted.slice(1);
                // Arquiva duplicados
                const ids = duplicates.map(d => d.id);
                await this.prisma.masterAsset.updateMany({ where: { id: { in: ids } }, data: { isActive: false, archivedAt: new Date() } });
                report.push({ key, kept: keeper.id, archived: ids });
            }
            return { success: true, groupsProcessed: report.length, details: report };
        }
}
