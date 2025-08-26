import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TestsService } from './tests.service';
import { GenerateFolderTestsDto } from './dto/generate-folder-tests.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { UpdateAnswersDto } from './dto/update-answers.dto';

@ApiTags('Tests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TestsController {
    constructor(private readonly tests: TestsService) { }

    // ===== Generování pro složku =====
    @Post('folders/:folderId/tests/generate')
    @ApiBody({ type: GenerateFolderTestsDto })
    async generateForFolder(
        @Param('folderId') folderId: string,
        @Body() dto: GenerateFolderTestsDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.tests.generateForFolder(
            folderId, user, dto.topicCount ?? 5, dto.finalCount ?? 20, dto.archiveExisting ?? true,
        );
    }

    // List testů ve složce
    @Get('folders/:folderId/tests')
    @ApiQuery({ name: 'includeArchived', required: false, schema: { type: 'boolean', default: false } })
    async listFolderTests(
        @Param('folderId') folderId: string,
        @Query('includeArchived') includeArchived = 'false',
        @CurrentUser() user: { userId: string },
    ) {
        return this.tests.listTestsForFolder(folderId, user, includeArchived === 'true');
    }

    // Detail testu (bez answerKey)
    @Get('tests/:id')
    async getPublicTest(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
        return this.tests.getPublicTest(id, user);
    }

    // Archivace / un-archivace testu
    @Patch('tests/:id')
    @ApiBody({ type: UpdateTestDto })
    async updateTest(@Param('id') id: string, @Body() dto: UpdateTestDto, @CurrentUser() user: { userId: string }) {
        return this.tests.updateTest(id, user, dto.archived);
    }

    // ===== Attempts =====
    @Post('tests/:id/attempts')
    async createAttempt(@Param('id') testId: string, @CurrentUser() user: { userId: string }) {
        return this.tests.createAttempt(testId, user);
    }

    @Patch('attempts/:id/answers')
    @ApiBody({ type: UpdateAnswersDto })
    async updateAnswers(@Param('id') id: string, @Body() dto: UpdateAnswersDto, @CurrentUser() user: { userId: string }) {
        return this.tests.updateAnswers(id, user, dto.answers);
    }

    @Post('attempts/:id/submit')
    async submitAttempt(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
        return this.tests.submitAttempt(id, user);
    }

    @Get('attempts/:id')
    async getAttempt(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
        return this.tests.getAttempt(id, user);
    }
}
