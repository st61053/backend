import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
    @ApiProperty({ example: '2025-08-29/1f3a8a7a-1c2b-4d5e-9f00-2a1b3c4d5e6f.png' })
    key: string;

    @ApiProperty({ example: 524288 })
    size: number;

    @ApiProperty({ example: 'image/png' })
    mime: string;

    @ApiProperty({
        example: 'https://minio.example.com/bucket/2025-08-29/uuid.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=…',
        description: 'Dočasný odkaz pro stažení',
    })
    presignedUrl: string;
}
