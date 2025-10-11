import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeletorProdutoNormalizado } from "./SeletorProdutoNormalizado";

interface ReceitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  receita?: any;
}

interface FormData {
  titulo: string;
  tempo_preparo: number | null;
  porcoes: number | null;
  video_url: string;
  modo_preparo: string;
  publica: boolean;
}

interface Ingrediente {
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  unidade_medida: string;
  opcional: boolean;
}

export function ReceitaDialog({ open, onOpenChange, onSuccess, receita }: ReceitaDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(receita?.imagem_url || null);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [tabAtual, setTabAtual] = useState("info");

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: {
      titulo: receita?.titulo || '',
      tempo_preparo: receita?.tempo_preparo || null,
      porcoes: receita?.porcoes || null,
      video_url: receita?.video_url || '',
      modo_preparo: receita?.modo_preparo || '',
      publica: receita?.publica ?? true,
    }
  });

  // Carregar ingredientes ao abrir para edição
  useEffect(() => {
    if (receita?.id && open) {
      // Resetar o form com os dados da receita
      reset({
        titulo: receita.titulo || '',
        tempo_preparo: receita.tempo_preparo || null,
        porcoes: receita.porcoes || null,
        video_url: receita.video_url || '',
        modo_preparo: receita.modo_preparo || '',
        publica: receita.publica ?? true,
      });

      // Atualizar preview da imagem
      setImagemPreview(receita.imagem_url || null);
      setImagemFile(null);

      // Buscar ingredientes existentes
      supabase
        .from('receita_ingredientes')
        .select('*')
        .eq('receita_id', receita.id)
        .then(({ data }) => {
          if (data) {
            setIngredientes(data.map(ing => ({
              produto_id: ing.produto_id || '',
              produto_nome: ing.produto_nome_busca,
              quantidade: ing.quantidade,
              unidade_medida: ing.unidade_medida,
              opcional: ing.opcional || false
            })));
          }
        });
    } else if (!receita && open) {
      // Limpar form ao abrir para nova receita
      reset({
        titulo: '',
        tempo_preparo: null,
        porcoes: null,
        video_url: '',
        modo_preparo: '',
        publica: true,
      });
      setIngredientes([]);
      setImagemPreview(null);
      setImagemFile(null);
    }
  }, [receita, open, reset]);

  const handleImagemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
        return;
      }
      setImagemFile(file);
      setImagemPreview(URL.createObjectURL(file));
    }
  };

  const handleAdicionarIngrediente = (produto: any, quantidade: number, unidade: string) => {
    setIngredientes(prev => [...prev, {
      produto_id: produto.id,
      produto_nome: produto.nome_padrao,
      quantidade,
      unidade_medida: unidade,
      opcional: false
    }]);
  };

  const handleRemoverIngrediente = (index: number) => {
    setIngredientes(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    if (ingredientes.length === 0) {
      toast({ title: "Adicione pelo menos 1 ingrediente", variant: "destructive" });
      setTabAtual("ingredientes");
      return;
    }

    setLoading(true);

    try {
      let imagem_url = receita?.imagem_url || null;
      let imagem_path = receita?.imagem_path || null;

      // Upload da imagem se houver
      if (imagemFile) {
        const fileExt = imagemFile.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receitas-imagens')
          .upload(filePath, imagemFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receitas-imagens')
          .getPublicUrl(filePath);

        imagem_url = publicUrl;
        imagem_path = filePath;
      }

      // Criar ou atualizar receita
      const receitaData = {
        titulo: data.titulo,
        instrucoes: data.modo_preparo, // Campo obrigatório
        tempo_preparo: data.tempo_preparo,
        porcoes: data.porcoes,
        video_url: data.video_url,
        modo_preparo: data.modo_preparo,
        publica: data.publica,
        user_id: user.id,
        imagem_url,
        imagem_path,
      };

      const { data: receitaCriada, error: receitaError } = receita?.id
        ? await supabase.from('receitas').update(receitaData).eq('id', receita.id).select().single()
        : await supabase.from('receitas').insert([receitaData]).select().single();

      if (receitaError) throw receitaError;

      // Deletar ingredientes antigos e inserir novos
      if (receita?.id) {
        await supabase.from('receita_ingredientes').delete().eq('receita_id', receita.id);
      }

      const ingredientesData = ingredientes.map(ing => ({
        receita_id: receitaCriada!.id,
        produto_id: ing.produto_id,
        produto_nome_busca: ing.produto_nome,
        quantidade: ing.quantidade,
        unidade_medida: ing.unidade_medida,
        opcional: ing.opcional,
      }));

      const { error: ingredientesError } = await supabase
        .from('receita_ingredientes')
        .insert(ingredientesData);

      if (ingredientesError) throw ingredientesError;

      toast({ title: receita?.id ? "Receita atualizada!" : "Receita criada!" });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{receita?.id ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
          <DialogDescription>
            Preencha as informações da sua receita deliciosa!
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs value={tabAtual} onValueChange={setTabAtual}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="ingredientes">Ingredientes</TabsTrigger>
            </TabsList>

            {/* Tab 1: Informações Básicas */}
            <TabsContent value="info" className="space-y-4">
              <div>
                <Label htmlFor="titulo">Título da Receita *</Label>
                <Input id="titulo" {...register("titulo", { required: true })} />
                {errors.titulo && <p className="text-sm text-destructive">Campo obrigatório</p>}
              </div>

              <div>
                <Label htmlFor="imagem">Foto da Receita</Label>
                <div className="flex items-center gap-4">
                  {imagemPreview && (
                    <img src={imagemPreview} alt="Preview" className="w-24 h-24 object-cover rounded-md" />
                  )}
                  <Input 
                    id="imagem" 
                    type="file" 
                    accept="image/*"
                    onChange={handleImagemChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tempo_preparo">Tempo de Preparo (min)</Label>
                  <Input id="tempo_preparo" type="number" {...register("tempo_preparo", { valueAsNumber: true })} />
                </div>
                <div>
                  <Label htmlFor="porcoes">Porções</Label>
                  <Input id="porcoes" type="number" {...register("porcoes", { valueAsNumber: true })} />
                </div>
              </div>

              <div>
                <Label htmlFor="video_url">Link do YouTube (opcional)</Label>
                <Input id="video_url" {...register("video_url")} placeholder="https://youtube.com/..." />
              </div>

              <div>
                <Label htmlFor="modo_preparo">Modo de Preparo *</Label>
                <Textarea 
                  id="modo_preparo" 
                  {...register("modo_preparo", { required: true })} 
                  rows={6}
                  placeholder="Descreva o passo a passo..."
                />
                {errors.modo_preparo && <p className="text-sm text-destructive">Campo obrigatório</p>}
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="publica" {...register("publica")} defaultChecked={true} />
                <Label htmlFor="publica">Receita Pública (outros usuários podem ver)</Label>
              </div>
            </TabsContent>

            {/* Tab 2: Ingredientes */}
            <TabsContent value="ingredientes" className="space-y-4">
              <SeletorProdutoNormalizado onAdicionar={handleAdicionarIngrediente} />

              {ingredientes.length > 0 && (
                <div className="space-y-2">
                  <Label>Ingredientes Adicionados:</Label>
                  {ingredientes.map((ing, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>{ing.produto_nome} - {ing.quantidade} {ing.unidade_medida}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoverIngrediente(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : receita?.id ? "Atualizar" : "Criar Receita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
