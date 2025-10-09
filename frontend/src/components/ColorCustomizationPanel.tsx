import { useState, useEffect } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
    getStatusColors,
    getStudioColors,
    saveStatusColors,
    saveStudioColors,
    defaultStatusColors,
    defaultStudioColors,
    colorPalette,
    type ColorConfig,
} from '@/lib/kanban-colors';
import { StatusLabels } from '@/types/kanban';

interface ColorCustomizationPanelProps {
    onColorsChange: () => void;
}

export const ColorCustomizationPanel = ({ onColorsChange }: ColorCustomizationPanelProps) => {
    const [open, setOpen] = useState(false);
    const [statusColors, setStatusColors] = useState<Record<string, ColorConfig>>({});
    const [studioColors, setStudioColors] = useState<Record<string, ColorConfig>>({});

    useEffect(() => {
        loadColors();
    }, []);

    const loadColors = () => {
        setStatusColors(getStatusColors());
        setStudioColors(getStudioColors());
    };

    const handleStatusColorChange = (status: string, color: ColorConfig) => {
        const newColors = { ...statusColors, [status]: color };
        setStatusColors(newColors);
        saveStatusColors(newColors);
        onColorsChange();
    };

    const handleStudioColorChange = (studio: string, color: ColorConfig) => {
        const newColors = { ...studioColors, [studio]: color };
        setStudioColors(newColors);
        saveStudioColors(newColors);
        onColorsChange();
    };

    const resetStatusColors = () => {
        setStatusColors(defaultStatusColors);
        saveStatusColors(defaultStatusColors);
        onColorsChange();
        toast.success('Cores de status restauradas!');
    };

    const resetStudioColors = () => {
        setStudioColors(defaultStudioColors);
        saveStudioColors(defaultStudioColors);
        onColorsChange();
        toast.success('Cores de studio restauradas!');
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                >
                    <Palette className="h-4 w-4 mr-2" />
                    Personalizar Cores
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto overflow-y-hidden">
                <DialogHeader>
                    <DialogTitle>Personalizar Cores</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="status" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="status">Status</TabsTrigger>
                        <TabsTrigger value="studio">Studio</TabsTrigger>
                    </TabsList>

                    <TabsContent value="status" className="space-y-4">

                        <div className="relative w-full max-w-[100vw] min-w-0 overflow-x-hidden">
                            <ScrollArea className="w-full max-w-[100vw] h-[calc(100vh-230px)] p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <p className="text-sm text-muted-foreground">
                                        Personalize as cores de cada status
                                    </p>
                                    <Button variant="ghost" size="sm" onClick={resetStatusColors}>
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Restaurar
                                    </Button>
                                </div>


                                {Object.entries(statusColors).map(([status, currentColor]) => (
                                    <div key={status} className="space-y-2 mb-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">
                                                {StatusLabels[status as keyof typeof StatusLabels]}
                                            </span>
                                            <span className={`text-xs px-3 py-1.5 rounded border ${currentColor.bg} ${currentColor.border} ${currentColor.text}`}>
                                                Preview
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-10 gap-2">
                                            {colorPalette.map((color) => (
                                                <button
                                                    key={color.name}
                                                    onClick={() => handleStatusColorChange(status, color.value)}
                                                    className={`h-8 w-8 rounded border-2 transition-all ${color.value.bg} ${color.value.border} ${currentColor.bg === color.value.bg
                                                        ? 'ring-2 ring-primary scale-110'
                                                        : 'hover:scale-105'
                                                        }`}
                                                    title={color.name}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    <TabsContent value="studio" className="space-y-4">
                        <div className="relative w-full max-w-[100vw] min-w-0 overflow-x-hidden">
                            <ScrollArea className="w-full max-w-[100vw] h-[calc(100vh-230px)] p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <p className="text-sm text-muted-foreground">
                                        Personalize as cores de cada studio
                                    </p>
                                    <Button variant="ghost" size="sm" onClick={resetStudioColors}>
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Restaurar
                                    </Button>
                                </div>


                                {Object.entries(studioColors).map(([studio, currentColor]) => (
                                    <div key={studio} className="space-y-2 mb-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">{studio}</span>
                                            <span className={`text-xs px-3 py-1.5 rounded border ${currentColor.bg} ${currentColor.border} ${currentColor.text}`}>
                                                Preview
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-10 gap-2">
                                            {colorPalette.map((color) => (
                                                <button
                                                    key={color.name}
                                                    onClick={() => handleStudioColorChange(studio, color.value)}
                                                    className={`h-8 w-8 rounded border-2 transition-all ${color.value.bg} ${color.value.border} ${currentColor.bg === color.value.bg
                                                        ? 'ring-2 ring-primary scale-110'
                                                        : 'hover:scale-105'
                                                        }`}
                                                    title={color.name}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
