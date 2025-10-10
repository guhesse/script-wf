import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Copy, UserCheck, Users, FileCheck, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface User {
    name: string;
    id: string;
    url: string;
}

const users: Record<'carol' | 'giovana', User> = {
    carol: {
        name: '@Carolina Lipinski',
        id: 'USER_6404f185031cb4594c66a99fa57c36e5',
        url: 'https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6404f185031cb4594c66a99fa57c36e5'
    },
    giovana: {
        name: '@Giovana Jockyman',
        id: 'USER_6414745101140908a941c911fbe572b4',
        url: 'https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6414745101140908a941c911fbe572b4'
    }
};

const CommentsGenerator = () => {
  const [selectedUser, setSelectedUser] = useState<'carol' | 'giovana'>('carol');
  const [copiedSection, setCopiedSection] = useState<number | null>(null);    const copyToClipboard = async (contentId: string, sectionNum: number, message: string) => {
        const content = document.getElementById(contentId);
        if (!content) return;

        try {
            // Cria um range de seleção
            const range = document.createRange();
            range.selectNodeContents(content);

            // Seleciona o conteúdo
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);

            // Copia usando a Clipboard API moderna
            if (navigator.clipboard && navigator.clipboard.write) {
                const htmlContent = content.innerHTML;
                const textContent = content.textContent || '';

                const clipboardItems = [
                    new ClipboardItem({
                        'text/html': new Blob([htmlContent], { type: 'text/html' }),
                        'text/plain': new Blob([textContent], { type: 'text/plain' })
                    })
                ];

                await navigator.clipboard.write(clipboardItems);

                toast.success(message);

                setCopiedSection(sectionNum);
                setTimeout(() => setCopiedSection(null), 2000);
            } else {
                // Fallback para navegadores mais antigos
                document.execCommand('copy');
                toast.success(message + ' (modo compatibilidade)');
            }

            // Remove a seleção
            selection?.removeAllRanges();

        } catch (err) {
            console.error('Erro ao copiar:', err);
            toast.error('Não foi possível copiar o conteúdo. Tente novamente.');
        }
    };

    const generateApprovalContent = () => {
        const user = users[selectedUser];
        return (
            <p className="mb-0">
                <a
                    href={user.url}
                    className="mention"
                    data-mention={user.id}
                    data-lexical-mention="true"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {user.name}
                </a>
                <span> </span>
                <a
                    href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66abd595000d58f156ae2cce417fd0a4"
                    className="mention"
                    data-mention="USER_66abd595000d58f156ae2cce417fd0a4"
                    data-lexical-mention="true"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    @Avidesh Bind
                </a>
                <span> </span>
                <a
                    href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66ab9d50000ead1d50a66758735c020b"
                    className="mention"
                    data-mention="USER_66ab9d50000ead1d50a66758735c020b"
                    data-lexical-mention="true"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    @Saish Kadam
                </a>
                <span> </span>
                <a
                    href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66a7e9b200333682efc3e680ca25bde8"
                    className="mention"
                    data-mention="USER_66a7e9b200333682efc3e680ca25bde8"
                    data-lexical-mention="true"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    @Jogeshkumar Vishwakarma
                </a>
                , for your approval.
            </p>
        );
    };

    const generateAssetReleaseContent = () => {
        const user = users[selectedUser];

        if (selectedUser === 'carol') {
            return (
                <p className="mb-0">
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682e04f003a037009d7bb6434c90f1bc"
                        className="mention"
                        data-mention="USER_682e04f003a037009d7bb6434c90f1bc"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Yasmin Lahm
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682cca1400bed8ae9149fedfdc5b0170"
                        className="mention"
                        data-mention="USER_682cca1400bed8ae9149fedfdc5b0170"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Gabriela Vargas
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66f6ab9b050fd317df75ed2a4de184e7"
                        className="mention"
                        data-mention="USER_66f6ab9b050fd317df75ed2a4de184e7"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Eduarda Ulrich
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6610596c008d57c44df182ec8183336d"
                        className="mention"
                        data-mention="USER_6610596c008d57c44df182ec8183336d"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Evili Borges
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/682e04e403a004b47dad0ce00a992d84"
                        className="mention"
                        data-mention="USER_682e04e403a004b47dad0ce00a992d84"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Giovanna Deparis
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/6867f5d90093ad0c57fbe5a22851a7d0"
                        className="mention"
                        data-mention="USER_6867f5d90093ad0c57fbe5a22851a7d0"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Natascha Batista
                    </a>
                    <span> </span>
                    <a
                        href={user.url}
                        className="mention"
                        data-mention={user.id}
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {user.name}
                    </a>
                    , segue a pasta com os assets finais da tarefa.
                </p>
            );
        } else {
            return (
                <p className="mb-0">
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66bcb320058d74ff5c0d17dd973e2de4"
                        className="mention"
                        data-mention="USER_66bcb320058d74ff5c0d17dd973e2de4"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Luiza Schmidt
                    </a>
                    <span> </span>
                    <a
                        href="https://experience.adobe.com/#/@dell/so:dell-Production/workfront/user/66548d5f197c3da898c4645c95589111"
                        className="mention"
                        data-mention="USER_66548d5f197c3da898c4645c95589111"
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @Gislaine Orico Paz
                    </a>
                    <span> </span>
                    <a
                        href={user.url}
                        className="mention"
                        data-mention={user.id}
                        data-lexical-mention="true"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {user.name}
                    </a>
                    , segue a pasta com os assets finais da tarefa.
                </p>
            );
        }
    };

    const generateFinalMaterialsContent = () => {
        const user = users[selectedUser];
        return (
            <p className="mb-0">
                <a
                    href={user.url}
                    className="mention"
                    data-mention={user.id}
                    data-lexical-mention="true"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {user.name}
                </a>
                , segue os materiais finais da tarefa.
            </p>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Gerador de Comentários</h2>
                <p className="text-muted-foreground">
                    Gere comentários formatados para o Workfront com menções preservadas
                </p>
            </div>

            {/* Seletor de Usuário */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        Selecione o(a) Responsável
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Button
                            variant={selectedUser === 'carol' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => setSelectedUser('carol')}
                        >
                            Carolina Lipinski
                        </Button>
                        <Button
                            variant={selectedUser === 'giovana' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => setSelectedUser('giovana')}
                        >
                            Giovana Jockyman
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Seção 1: Aprovação SM */}
            <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                            <UserCheck className="h-5 w-5" />
                            1. Aprovação SM
                        </CardTitle>
                        <Button
                            size="sm"
                            variant={copiedSection === 1 ? 'default' : 'outline'}
                            onClick={() => copyToClipboard('approval-content', 1, '✅ Aprovação copiada com sucesso!')}
                        >
                            {copiedSection === 1 ? (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Copiado!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copiar
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        id="approval-content"
                        className="p-4 rounded-lg bg-background/80 border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 dark:hover:border-purple-500 transition-all cursor-pointer"
                        onClick={() => copyToClipboard('approval-content', 1, '✅ Aprovação copiada com sucesso!')}
                    >
                        {generateApprovalContent()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        👆 Clique na caixa ou no botão para copiar
                    </p>
                </CardContent>
            </Card>

            {/* Seção 2: Asset Release */}
            <Card className="border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                            <Users className="h-5 w-5" />
                            2. Asset Release - Equipe Completa
                        </CardTitle>
                        <Button
                            size="sm"
                            variant={copiedSection === 2 ? 'default' : 'outline'}
                            onClick={() => copyToClipboard('asset-release-content', 2, '✅ Asset Release copiado com sucesso!')}
                        >
                            {copiedSection === 2 ? (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Copiado!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copiar
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        id="asset-release-content"
                        className="p-4 rounded-lg bg-background/80 border-2 border-dashed border-orange-300 dark:border-orange-700 hover:border-orange-500 dark:hover:border-orange-500 transition-all cursor-pointer"
                        onClick={() => copyToClipboard('asset-release-content', 2, '✅ Asset Release copiado com sucesso!')}
                    >
                        {generateAssetReleaseContent()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        👆 Clique na caixa ou no botão para copiar
                    </p>
                </CardContent>
            </Card>

            {/* Seção 3: Final Materials */}
            <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                            <FileCheck className="h-5 w-5" />
                            3. Final Materials
                        </CardTitle>
                        <Button
                            size="sm"
                            variant={copiedSection === 3 ? 'default' : 'outline'}
                            onClick={() => copyToClipboard('final-materials-content', 3, '✅ Final Materials copiado com sucesso!')}
                        >
                            {copiedSection === 3 ? (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Copiado!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copiar
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        id="final-materials-content"
                        className="p-4 rounded-lg bg-background/80 border-2 border-dashed border-green-300 dark:border-green-700 hover:border-green-500 dark:hover:border-green-500 transition-all cursor-pointer"
                        onClick={() => copyToClipboard('final-materials-content', 3, '✅ Final Materials copiado com sucesso!')}
                    >
                        {generateFinalMaterialsContent()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        👆 Clique na caixa ou no botão para copiar
                    </p>
                </CardContent>
            </Card>

            {/* Estilos CSS para as menções */}
            <style>{`
        .mention {
          background-color: hsl(var(--primary) / 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          text-decoration: none;
          color: hsl(var(--primary));
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .mention:hover {
          background-color: hsl(var(--primary) / 0.2);
          color: hsl(var(--primary));
        }

        .dark .mention {
          background-color: hsl(var(--primary) / 0.2);
        }

        .dark .mention:hover {
          background-color: hsl(var(--primary) / 0.3);
        }
      `}</style>
        </div>
    );
};

export default CommentsGenerator;
