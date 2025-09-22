import { Controller, Get, Post, Patch, Param, Body, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { MastersService } from './masters.service';
import { CreateMasterDto } from './dto/create-master.dto';
import { UpdateMasterDto, ListMastersQueryDto } from './dto/update-master.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

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
    @ApiOperation({ summary: 'Criar novo master (registro de metadados)' })
    create(@Body() dto: CreateMasterDto) {
        return this.mastersService.create(dto);
    }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({ summary: 'Upload de arquivo master (multipart form-data)' })
    upload(
        @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
        @Body() body: { title?: string; brand?: string; editableType?: string; tags?: string; subfolder?: string; previewBase64?: string }
    ) {
        return this.mastersService.uploadAndRegister({ file, ...body });
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Atualizar master (metadados)' })
    update(@Param('id') id: string, @Body() dto: UpdateMasterDto) {
        return this.mastersService.update(id, dto);
    }

    @Patch(':id/archive')
    @ApiOperation({ summary: 'Arquivar master' })
    archive(@Param('id') id: string) {
        return this.mastersService.archive(id);
    }

    @Post('admin/consolidate')
    @ApiOperation({ summary: 'Consolidar duplicados legacy (admin)' })
    consolidate() {
        return this.mastersService.consolidateDuplicates();
    }
}
