import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { StoredFile } from '../files/schemas/file.schema';
import { Folder } from './schemas/folder.schema';
import { FolderResponseDto } from './dto/folder.dto';

@ApiTags('Folders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FoldersController {
    constructor(
        @InjectModel(Folder.name) private readonly folderModel: Model<Folder>,
        @InjectModel(StoredFile.name) private readonly fileModel: Model<StoredFile>,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Vytvoří novou složku' })
    @ApiBody({
        type: CreateFolderDto,
        examples: {
            Basic: {
                summary: 'Pouze povinný název',
                value: {
                    name: 'Školní materiály',
                },
            },
            WithColorAndIcon: {
                summary: 'S barvou a ikonkou',
                value: {
                    name: 'Projekt X',
                    color: '#00CCFF',
                    icon: '📂',
                },
            },
        },
    })
    @ApiResponse({
        status: 201,
        description: 'Nově vytvořená složka',
        schema: {
            example: {
                id: '123',
                name: 'Projekt X',
                color: '#00CCFF',
                icon: '📂',
            },
        },
    })
    async create(@Body() dto: CreateFolderDto, @CurrentUser() user: { userId: string }) {
        const created = await this.folderModel.create({
            name: dto.name,
            color: dto.color,
            icon: dto.icon,
            ownerId: user.userId,
        });

        return {
            id: created.id,
            name: created.name,
            color: created.color,
            icon: created.icon,
        };
    }


    @Get()
    @ApiOperation({ summary: 'Vrátí seznam složek uživatele (seřazeno od nejnovějších)' })
    @ApiOkResponse({
        description: 'Pole složek',
        type: FolderResponseDto,
        isArray: true,
        schema: {
            example: [
                { id: '6659f0d2a3b1c2d4e5f67890', name: 'Projekt X', color: '#00CCFF', icon: '📂' },
                { id: '6659f0d2a3b1c2d4e5f67891', name: 'Školní materiály', color: '#FFAA00', icon: '📁' }
            ],
        },
    })
    async list(@CurrentUser() user: { userId: string }) {
        const rows = await this.folderModel
            .find({ ownerId: user.userId })
            .sort({ createdAt: -1 })
            .lean();

        return rows.map(r => ({
            id: r._id.toString(),
            name: r.name,
            color: r.color,
            icon: r.icon,
        }));
    }

    @Patch(':id')
    async rename(@Param('id') id: string, @Body() dto: RenameFolderDto, @CurrentUser() user: { userId: string }) {
        await this.folderModel.updateOne({ _id: id, ownerId: user.userId }, { $set: { name: dto.name } });
        return { ok: true };
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
        const count = await this.fileModel.countDocuments({ folderId: id, uploaderId: user.userId });
        if (count > 0) return { ok: false, reason: 'Folder not empty' };
        await this.folderModel.deleteOne({ _id: id, ownerId: user.userId });
        return { ok: true };
    }
}
