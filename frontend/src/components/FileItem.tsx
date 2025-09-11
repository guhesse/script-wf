import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  FileImage, 
  FileVideo, 
  Archive, 
  FileSpreadsheet, 
  Presentation,
  Palette,
  File,
  ExternalLink
} from 'lucide-react';
import type { WorkfrontFile } from '@/types';

interface FileItemProps {
  file: WorkfrontFile;
  folderName: string;
  isSelected: boolean;
  onToggle: (folderName: string, fileName: string) => void;
}

const getFileIcon = (type: string) => {
  const iconProps = { className: "h-8 w-8 text-blue-600" };
  
  const iconMap: Record<string, React.ReactNode> = {
    'ZIP Archive': <Archive {...iconProps} />,
    'PDF Document': <FileText {...iconProps} />,
    'Word Document': <FileText {...iconProps} />,
    'Excel Spreadsheet': <FileSpreadsheet {...iconProps} />,
    'PowerPoint': <Presentation {...iconProps} />,
    'Image': <FileImage {...iconProps} />,
    'Video': <FileVideo {...iconProps} />,
    'Document': <FileText {...iconProps} />,
    'Archive': <Archive {...iconProps} />,
    'Spreadsheet': <FileSpreadsheet {...iconProps} />,
    'Presentation': <Presentation {...iconProps} />,
    'image': <FileImage {...iconProps} />,
    'video': <FileVideo {...iconProps} />,
    'document': <FileText {...iconProps} />,
    'presentation': <Presentation {...iconProps} />,
    'design': <Palette {...iconProps} />,
    'text': <FileText {...iconProps} />
  };

  return iconMap[type] || <File {...iconProps} />;
};

export const FileItem = ({ file, folderName, isSelected, onToggle }: FileItemProps) => {
  const handleClick = () => {
    onToggle(folderName, file.name);
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-50 ${
        isSelected ? 'border-blue-500 bg-blue-100' : 'border-gray-200'
      }`}
      onClick={handleClick}
    >
      <div className="flex items-center space-x-3">
        <Checkbox 
          checked={isSelected}
          onChange={handleClick}
          className="pointer-events-none"
        />
        
        {getFileIcon(file.type)}
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {file.name}
          </div>
          <div className="text-sm text-gray-500">
            {file.size || 'N/A'}
            {file.addedInfo && ` • ${file.addedInfo}`}
          </div>
          
          {file.url && file.url !== 'N/A' && (
            <div className="mt-1">
              <a 
                href={file.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                onClick={handlePreviewClick}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Preview
              </a>
            </div>
          )}
        </div>
        
        <Badge variant="secondary">
          {file.type}
        </Badge>
      </div>
    </div>
  );
};