import { Controller, Get, Post, Patch, Param, Body, Query, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { MastersService } from './masters.service';
import { CreateMasterDto } from './dto/create-master.dto';
import { UpdateMasterDto, ListMastersQueryDto } from './dto/update-master.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Masters')
@Controller('api/masters')
export class MastersController {
    constructor(private readonly mastersService: MastersService) { }

    @Get()
    @ApiOperation({ summary: 'Listar masters com filtros e paginação' })
    list(@Query() query: ListMastersQueryDto) {
        return this.mastersService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter master por ID' })
    getOne(@Param('id') id: string) {
        return this.mastersService.findOne(id);
    }

    @Get('meta/all')
    @ApiOperation({ summary: 'Metadados (brands e tags permitidas)' })
    meta() {
        return this.mastersService.getMeta();
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('EDITOR','ADMIN')
    @ApiOperation({ summary: 'Criar novo master (registro de metadados) [EDITOR|ADMIN]' })
    create(@Body() dto: CreateMasterDto) {
        return this.mastersService.create(dto);
    }

    @Post('upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('EDITOR','ADMIN')
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({ summary: 'Upload de arquivo master (multipart form-data) [EDITOR|ADMIN]' })
    upload(
        @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
        @Body() body: { title?: string; brand?: string; editableType?: string; tags?: string; subfolder?: string; previewBase64?: string }
    ) {
        return this.mastersService.uploadAndRegister({ file, ...body });
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('EDITOR','ADMIN')
    @ApiOperation({ summary: 'Atualizar master (metadados) [EDITOR|ADMIN]' })
    update(@Param('id') id: string, @Body() dto: UpdateMasterDto) {
        return this.mastersService.update(id, dto);
    }

    @Patch(':id/archive')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Arquivar master [ADMIN]' })
    archive(@Param('id') id: string) {
        return this.mastersService.archive(id);
    }

    @Post('admin/consolidate')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Consolidar duplicados legacy (admin) [ADMIN]' })
    consolidate() {
        return this.mastersService.consolidateDuplicates();
    }
}
