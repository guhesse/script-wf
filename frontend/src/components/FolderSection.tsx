import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Folder } from 'lucide-react';
import { FileItem } from './FileItem';
import type { WorkfrontFolder } from '@/types';

interface FolderSectionProps {
  folder: WorkfrontFolder;
  selectedFiles: Set<string>;
  onFileToggle: (folderName: string, fileName: string) => void;
  onSelectAll: (folderName: string) => void;
  onDeselectAll: (folderName: string) => void;
}

export const FolderSection = ({
  folder,
  selectedFiles,
  onFileToggle,
  onSelectAll,
  onDeselectAll
}: FolderSectionProps) => {
  return (
    <Card className="mb-4">
      <div className=" bg-primary text-white -t-lg p-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center">
            <Folder className="mr-2 h-5 w-5" />
            {folder.name}
          </h3>
          <div className="space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSelectAll(folder.name)}
              className="text-white bg-violet-900 border-white hover:bg-violet-900/70 hover:text-white"
            >
              Selecionar Todos
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDeselectAll(folder.name)}
              className="text-white bg-violet-800 border-white hover:bg-violet-800/70 hover:text-white"
            >
              Desmarcar Todos
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        {folder.files.map((file) => {
          const fileKey = `${folder.name}-${file.name}`;
          return (
            <FileItem
              key={fileKey}
              file={file}
              folderName={folder.name}
              isSelected={selectedFiles.has(fileKey)}
              onToggle={onFileToggle}
            />
          );
        })}
      </CardContent>
    </Card>
  );
};