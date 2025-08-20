import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
    constructor(private readonly docs: DocumentsService) { }

    @Post()
    async create(@Body() dto: CreateDocumentDto, @CurrentUser() user: { userId: string }) {
        return this.docs.create(dto.title, dto.folderId, dto.fileId, user);
    }

    @Get(':id')
    async getOne(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
        return this.docs.getByIdForUser(id, user);
    }

    @Get(':id/chunks')
    async chunks(
        @Param('id') id: string,
        @Query('limit') limit = 100,
        @Query('skip') skip = 0,
        @CurrentUser() user: { userId: string },
    ) {
        return this.docs.getChunksForUser(id, user, Number(limit), Number(skip));
    }
}
