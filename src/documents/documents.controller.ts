import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoredFile } from '../files/schemas/file.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/documents')
export class DocumentsController {
    constructor(@InjectModel(StoredFile.name) private model: Model<StoredFile>) { }

    @Get()
    async myDocs(
        @CurrentUser() user: { userId: string },
        @Query('limit') limit = 50,
        @Query('skip') skip = 0,
    ) {
        // pro MVP: pokud zatím neukládáš uploaderId při uploadu, vrátí to prázdné []
        return this.model
            .find({ uploaderId: user.userId })
            .sort({ createdAt: -1 })
            .skip(Number(skip))
            .limit(Number(limit))
            .lean();
    }
}
