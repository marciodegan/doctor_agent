import React from "react";
import { Shield, ArrowLeft, AppWindow, FileSpreadsheet } from "lucide-react";

export default function PrivacyPolicy() {
  const dateStr = "22 de maio de 2026";
  const supportEmail = "contato@dragent.app";
  const supportDomain = "https://dragent.app";

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900 pb-16">
      <header className="sticky top-0 z-50 border-b border-slate-200/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Shield size={21} />
            </div>
            <div>
              <p className="text-base font-black tracking-tight text-blue-950">Dr. Agent</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">Legal & Privacidade</p>
            </div>
          </a>

          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft size={14} />
            Voltar para início
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-10">
        <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white p-6 md:p-10 shadow-sm">
          <div className="mb-8 border-b border-slate-100 pb-6 text-left">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700 tracking-wider uppercase rounded-lg mb-3">
              Documento Oficial
            </span>
            <h1 className="text-3xl font-black text-blue-950 tracking-tight">Política de Privacidade</h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">Última atualização: {dateStr}</p>
          </div>

          <div className="prose prose-slate max-w-none text-left space-y-6 text-sm md:text-base leading-relaxed text-slate-600">
            <p>
              Esta Política de Privacidade explica como o <strong>Dr. Agent</strong> coleta, usa, armazena e protege informações quando você utiliza nosso aplicativo, site, PWA e serviços relacionados.
            </p>
            <p>
              Ao usar o Dr. Agent, você concorda com as práticas descritas nesta Política. Se você não concordar, não utilize o aplicativo.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">1. Quem somos</h2>
            <p>
              O Dr. Agent é uma aplicação criada para auxiliar médicos, cirurgiões e equipes autorizadas na organização de fluxos de trabalho clínicos, incluindo acompanhamento de pacientes, agenda de procedimentos, contatos, informações, imagens e documentos.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-1">
              <p><strong>Contato do responsável:</strong></p>
              <p>E-mail: <a href={`mailto:${supportEmail}`} className="text-blue-600 hover:underline">{supportEmail}</a></p>
              <p>Site: <a href={supportDomain} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{supportDomain}</a></p>
            </div>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">2. Informações que coletamos</h2>
            <p>Podemos coletar as seguintes informações:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>a) Dados de cadastro e autenticação:</strong> nome; e-mail; foto de perfil, quando fornecida pela conta Google; identificador da conta autenticada; informações de login e sessão.
              </li>
              <li>
                <strong>b) Dados inseridos pelo usuário no aplicativo:</strong> informações de pacientes; contatos relacionados aos pacientes; hospitais, quartos, status e procedimentos; observações, anotações e histórico; imagens, documentos e arquivos enviados; eventos de calendário e informações de agenda.
              </li>
              <li>
                <strong>c) Dados técnicos:</strong> endereço IP; tipo de navegador; dispositivo; logs de uso; registros de erro; data e hora de acesso.
              </li>
            </ul>

            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-blue-600 pl-3 py-1 uppercase tracking-wider pt-4">3. Dados do Google acessados pelo app</h2>
            <p>
              Quando você escolhe entrar com Google ou conectar serviços do Google, o Dr. Agent poderá solicitar acesso a alguns dados de sua Conta Google, conforme as permissões exibidas de modo transparente na tela oficial de consentimento do Google.
            </p>
            <p>O app pode acessar:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Nome, endereço de e-mail e foto de perfil (se disponível) para personalização do workspace.</li>
              <li>Eventos do Google Calendar, quando você utiliza ativamente os recursos integrados de visualização e agendamento de consultas ou procedimentos.</li>
              <li>Arquivos e pastas específicas do seu Google Drive, quando você utiliza recursos de anexos, documentos clínicos ou ativa o armazenamento centralizado.</li>
            </ul>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2 mt-3">
              <p className="font-bold text-blue-900">Compromisso com o Consentimento e Uso Seguro de Dados:</p>
              <p className="text-xs text-blue-800 leading-relaxed">
                O Dr. Agent usa esses dados exclusivamente de forma passiva para autenticar sua conta, exibir informações reais no calendário integradas ao seu fluxo de trabalho, e opcionalmente indexar arquivos associados aos pacientes.
              </p>
              <p className="text-xs font-bold text-blue-900">
                O Dr. Agent NÃO vende seus dados do Google (e nenhum outro dado pessoal), NÃO compartilha com agências ou plataformas de publicidade, e NÃO os utiliza sob nenhuma hipótese para treinar modelos de inteligência artificial ou algoritmos preditivos que desrespeitem sua privacidade.
              </p>
            </div>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">4. Como usamos suas informações</h2>
            <p>Usamos suas informações exclusivas com objetivo de:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>permitir o acesso seguro e personalizado ao aplicativo;</li>
              <li>organizar pacientes, contatos, imagens, documentos e eventos cirúrgicos;</li>
              <li>permitir colaboração ágil entre os membros autorizados de um mesmo grupo de trabalho;</li>
              <li>sincronizar dados com serviços do Google mediante sua autorização direta;</li>
              <li>garantir a estabilidade técnica, monitoramento de falhas e segurança de rede do aplicativo;</li>
              <li>cumprir obrigações legais, regulatórias ou fiscais aplicáveis;</li>
              <li>prestar o correto suporte ao usuário.</li>
            </ul>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">5. Base legal para tratamento de dados</h2>
            <p>
              Tratamos dados pessoais em total conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD)</strong> do Brasil, estabelecendo bases legais sólidas baseadas na prestação de serviço contratual, consentimento explícito, proteção da vida, tutela da saúde e legítimo interesse institucional.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">6. Dados de pacientes e informações sensíveis</h2>
            <p>
              O Dr. Agent atua meramente como processador tecnológico para as informações que você e sua equipe registram de seus pacientes. O usuário na qualidade de profissional de saúde (Controlador) é responsável absoluto por:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>inserir apenas informações estritamente necessárias ao fluxo clínico operacional;</li>
              <li>obter previamente as autorizações necessárias segundo as regras do CFM ou da lei;</li>
              <li>não compartilhar acessos, e-mails ou senhas com terceiros.</li>
            </ul>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">7. Compartilhamento de dados</h2>
            <p>
              Não comercializamos dados sob hipótese alguma. Os dados armazenados são compartilhados estritamente com serviços de nuvem confiáveis (como Google Cloud e Firebase) necessários para fornecer a infraestrutura ativa do aplicativo.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">8. Armazenamento e segurança</h2>
            <p>
              Adotamos criptografia SSL/TLS de ponta a ponta durante as conexões (trânsito) e salvaguardamos o armazenamento através dos mecanismos modernos oferecidos pelo Firebase (Google) com regras de restrição de acesso lógico de grupo.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">9. Direitos do usuário</h2>
            <p>
              Você goza plenamente de todos os direitos listados no artigo 18 da LGPD, podendo requisitar a confirmação do tratamento, acesso, correção dos dados incompletos ou a imediata eliminação dos seus dados enviando sua solicitação expressa ao e-mail de suporte.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">10. Revogação de acesso Google</h2>
            <p>
              Você pode revogar as autorizações dadas ao Dr. Agent a qualquer momento através do painel de controle <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Configurações de Segurança da sua Conta Google</a>.
            </p>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center border-t border-slate-100 pt-8">
            <a
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <AppWindow size={16} />
              Acessar aplicativo
            </a>
            <a
              href="/eula"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <FileSpreadsheet size={16} />
              Ver Termos de Uso (EULA)
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
