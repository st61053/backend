import { ApiProperty } from '@nestjs/swagger';

export class FolderResponseDto {
    @ApiProperty({ example: '6659f0d2a3b1c2d4e5f67890' })
    id: string;

    @ApiProperty({ example: 'Projekt X' })
    name: string;

    @ApiProperty({ example: '#00CCFF', nullable: true })
    color?: string | null;

    @ApiProperty({ example: '📂', nullable: true })
    icon?: string | null;
}
