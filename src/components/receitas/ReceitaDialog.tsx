import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "./ImageUpload";
import { IngredientesManager } from "./IngredientesManager";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface ReceitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceitaDialog({ open, onOpenChange }: ReceitaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [imagemUrl, setImagemUrl] = useState<string>("");
  const [imagemPath, setImagemPath] = useState<string>("");
  const [ingredientes, setIngredientes] = useState<any[]>([]);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue } = useForm();

  // Buscar categorias disponíveis
  const { data: categorias } = useQuery({
    queryKey: ["categorias-receitas"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("buscar-receitas-api", {
        body: { mode: "categories", api: "themealdb" }
      });
      if (error) throw error;
      return data?.receitas || [];
    },
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: receitaCriada, error } = await supabase.from("receitas").insert({
        titulo: data.titulo,
        descricao: data.descricao,
        tempo_preparo: parseInt(data.tempo_preparo) || 0,
        porcoes: parseInt(data.porcoes) || 1,
        instrucoes: data.modo_preparo || "",
        fonte: 'minha',
        user_id: user.id,
        imagem_url: imagemUrl || null,
        imagem_path: imagemPath || null,
        categoria: data.categoria || null,
        tipo_refeicao: data.tipo_refeicao || null,
      }).select().single();

      if (error) throw error;

      // Adicionar ingredientes se houver
      if (ingredientes.length > 0 && receitaCriada) {
        const ingredientesParaInserir = ingredientes.map(ing => ({
          receita_id: receitaCriada.id,
          produto_nome_busca: ing.ingrediente,
          quantidade: parseFloat(ing.quantidade) || 1,
          unidade_medida: ing.unidade_medida,
          opcional: false,
        }));

        const { error: ingError } = await supabase
          .from('receita_ingredientes')
          .insert(ingredientesParaInserir);

        if (ingError) console.error('Erro ao adicionar ingredientes:', ingError);
      }

      toast.success("Receita criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["receitas-disponiveis"] });
      reset();
      setImagemUrl("");
      setImagemPath("");
      setIngredientes([]);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar receita");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Receita</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Foto da Receita</Label>
            <ImageUpload
              currentImage={imagemUrl}
              onImageUploaded={(url, path) => {
                setImagemUrl(url);
                setImagemPath(path);
              }}
              onImageRemoved={() => {
                setImagemUrl("");
                setImagemPath("");
              }}
            />
          </div>

          <div>
            <Label>Título</Label>
            <Input {...register("titulo", { required: true })} placeholder="Nome da receita" />
          </div>

          <div>
            <Label>Tipo de Refeição</Label>
            <Select onValueChange={(value) => setValue("tipo_refeicao", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de refeição" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cafe_manha">Café da Manhã</SelectItem>
                <SelectItem value="almoco">Almoço</SelectItem>
                <SelectItem value="jantar">Jantar</SelectItem>
                <SelectItem value="lanche">Lanche</SelectItem>
                <SelectItem value="sobremesa">Sobremesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Categoria</Label>
            <Select onValueChange={(value) => setValue("categoria", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria de comida" />
              </SelectTrigger>
              <SelectContent>
                {categorias?.map((cat: any) => (
                  <SelectItem key={cat.idCategory} value={cat.strCategory}>
                    {cat.strCategory}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tempo Preparo (min)</Label>
              <Input type="number" {...register("tempo_preparo")} placeholder="30" />
            </div>
            <div>
              <Label>Porções</Label>
              <Input type="number" {...register("porcoes")} placeholder="4" />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea {...register("descricao")} placeholder="Breve descrição da receita" rows={2} />
          </div>

          <div>
            <Label>Modo de Preparo</Label>
            <Textarea {...register("modo_preparo")} placeholder="Digite cada passo em uma linha" rows={6} />
          </div>

          <IngredientesManager
            ingredientes={ingredientes}
            onChange={setIngredientes}
          />

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Criando..." : "Criar Receita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
