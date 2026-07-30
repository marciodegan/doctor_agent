export const generatePatientReport = (data: any) => {
  if (!data || !data.cadastro) return "";
  const cad = data.cadastro;
  const audios = (data.audios || []).map((a: any) => `
**${a.conteudo}**  
_${a.data}_  
\`/editar_log id: ${a.id}, pId: ${cad.ID} label:✏️\` \`/remover_informacao id: ${a.id}, pId: ${cad.ID} label:🗑️\`
`).join("\n");
  
  const docs = (data.imagens || []).map((i: any) => {
    let aiPart = "";
    const analysis = i.aiAnalysis || i.aiResposta;
    if (analysis) {
      aiPart = `\n\n> 🤖 **Análise Inteligente:**\n> ${analysis.split('\n').join('\n> ')}\n`;
    }

    const imgTag = i.link 
      ? `![${i.descricao || 'Imagem'}](${i.link})\n`
      : "";
    
    return `
${imgTag}
**${i.descricao || 'Sem descrição'}**  
_${i.data}_  
\`/remover_imagem id: ${i.id}, pId: ${cad.ID} label:🗑️\`
${aiPart}
`;
  }).join("\n---\n");

  const fams = (data.familiares || []).map((f: any) => {
    const cleanFone = f.fone ? f.fone.replace(/\D/g, "") : "";
    const waNumber = cleanFone ? (cleanFone.startsWith("55") ? cleanFone : "55" + cleanFone) : "";
    const foneLink = waNumber 
      ? `[📞 **${f.fone}**](https://wa.me/${waNumber})` 
      : "📞 Sem telefone";
    return `
**${f.nome}** ${f.relacao ? `(${f.relacao})` : ""} ${foneLink}  
\`/editar_familiar id: ${f.id}, pId: ${cad.ID} label:✏️\` \`/remover_familiar id: ${f.id}, pId: ${cad.ID} label:🗑️\`
`;
  }).join("\n");

  const cadFone = cad.Telefone;
  const cleanCadFone = cadFone ? cadFone.replace(/\D/g, "") : "";
  const waCadNumber = cleanCadFone ? (cleanCadFone.startsWith("55") ? cleanCadFone : "55" + cleanCadFone) : "";
  const cadFoneLink = waCadNumber 
    ? `[📞 **${cadFone}**](https://wa.me/${waCadNumber})` 
    : "";
  const patientContact = cadFoneLink ? `
**Paciente (Próprio)** ${cadFoneLink}
` : "";

  return `\`/novofamiliar id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Contatos:**\n\n${patientContact || ""}\n${fams || (patientContact ? "" : "Nenhum registro")}\n\n` +
    `\`/logpac id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Informações:**\n\n${audios || "Nenhum registro"}\n\n` +
    `\`/prep_img id: ${cad.ID}, nome: ${cad.Nome} label:+\` **Imagens:**\n\n${docs || "Nenhum registro"}`;
};
