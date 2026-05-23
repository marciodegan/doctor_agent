import React from "react";
import { FileText, ArrowLeft, AppWindow, ShieldAlert } from "lucide-react";

export default function Eula() {
  const dateStr = "22 de maio de 2026";
  const supportEmail = "contato@doctor-agent.online";
  const supportDomain = "https://doctor-agent.online";

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900 pb-16">
      <header className="sticky top-0 z-50 border-b border-slate-200/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <FileText size={21} />
            </div>
            <div>
              <p className="text-base font-black tracking-tight text-blue-950">Dr. Agent</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">Legal & Termos</p>
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
              Contrato de Usuário
            </span>
            <h1 className="text-3xl font-black text-blue-950 tracking-tight">EULA / Termos de Uso</h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">Última atualização: {dateStr}</p>
          </div>

          <div className="prose prose-slate max-w-none text-left space-y-6 text-sm md:text-base leading-relaxed text-slate-600">
            <p>
              Este <strong>Contrato de Licença de Usuário Final e Termos de Uso</strong> regula o acesso e o uso continuado do aplicativo <strong>Dr. Agent</strong>, incluindo o site associado, Progressive Web App (PWA), aplicativos de apoio, bancos de dados integrados, integrações automáticas e demais serviços correlatos.
            </p>
            <p>
              Ao utilizar ou se cadastrar nas dependências tecnológicas do Dr. Agent, você concorda explicitamente com este contrato. Caso divirja de nossos termos ou políticas sob qualquer aspecto, suspenda o uso imediatamente.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">1. Definições gerais</h2>
            <p>
              <strong>"Dr. Agent":</strong> Significa a plataforma integrada voltada à agilização de fluxos cirúrgicos e médicos operacionais descritos neste documento.
            </p>
            <p>
              <strong>"Usuário":</strong> Designa qualquer profissional de saúde ou membro de equipe devidamente autenticado e ingressado na aplicação.
            </p>
            <p>
              <strong>"Grupo":</strong> Significa o ecossistema interno, segmentado e estritamente restrito, criado pelos próprios usuários para centralização segura das tarefas cotidianas.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">2. Licença do uso de software</h2>
            <p>
              Concedemos a você uma licença de software de caráter pessoal, temporária, revogável, não-exclusiva e intransferível para o uso exclusivo das facilidades do app. O usuário compreende expressamente que não obtém a propriedade industrial, copyright ou direitos sobre o código fonte, banco de dados ou marcas registradas.
            </p>

            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-blue-600 pl-3 py-1 uppercase tracking-wider pt-4">3. Finalidade estrita do aplicativo</h2>
            <p>
              O Dr. Agent é uma ferramenta digital projetada exclusivamente para organização gerencial e coordenação técnica do fluxo clínico diário de cirurgiões, médicos e parceiros. <strong>Ele auxilia no controle interno de:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Acompanhamento de status de internação, quartos, leitos e hospitais;</li>
              <li>Sinalização de procedimentos cirúrgicos programados ou realizados;</li>
              <li>Catalogação temporária e de rápido acesso de dados secundários necessários à segurança dos procedimentos;</li>
              <li>Apoio visual por meio de envio de arquivos médicos anexados;</li>
              <li>Acesso rápido a contatos urgentes para facilitar a comunicação da equipe em prontidão.</li>
            </ul>
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs md:text-sm rounded-2xl flex items-start gap-4">
              <ShieldAlert size={24} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Informação Essencial:</p>
                <p className="leading-relaxed">
                  <strong>O software Dr. Agent NÃO é um Prontuário Eletrônico do Paciente (PEP) homologado ou substitutivo legal dos sistemas hospitalares regulamentados.</strong> Sua finalidade é estritamente administrativa-operacional e comunicativa na coordenação pré/pós-operatória imediata do fluxo de trabalho cirúrgico.
                </p>
              </div>
            </div>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">4. Obrigações e responsabilidades cabíveis</h2>
            <p>Cabe unicamente a cada usuário contratante ou convidado garantir:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Uso ético, lícito e regulamentado perante as diretrizes dos respectivos conselhos competentes (como o CFM);</li>
              <li>O estrito dever de sigilo profissional acerca de quaisquer dados de pacientes inseridos na plataforma;</li>
              <li>Garantir o consentimento ou base justificável exigida por lei antes de cadastrar informações operacionais de terceiros;</li>
              <li>A não inserção de dados falsos, dados pessoais impertinentes ou de infração civil.</li>
            </ul>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">5. Segurança de grupo e segregação lógica</h2>
            <p>
              A fim de preservar a barreira lógica entre as informações, o Dr. Agent opera sistemas modernos de filtragem lógica por identificadores de Grupos. O usuário concorda em manter sua senha em absoluto segredo e não compartilhar voluntariamente ou por imprudência o acesso digital a terceiros externos ao seu grupo.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">6. Contas e conexões Google</h2>
            <p>
              O sistema utiliza mecanismos de API oficiais (como Google OAuth, Google Calendar e Google Drive) para integrar facilidades ao seu dia-a-dia. Você pode cessar tais conexões de forma integral a qualquer momento diretamente nas opções de sua conta Google, declarando-se ciente de que alguns recursos do app deixarão de operar.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">7. Recursos baseados em Inteligência Artificial</h2>
            <p>
              Caso venha a utilizar utilitários de IA dentro da aplicação, o usuário declara estar ciente de que as tecnologias computacionais são geradoras em seu escopo de probabilidade científica e podem incorrer em desvios ("alucinações").
            </p>
            <p className="font-bold">
              As análises preditivas ou geradas por IA são meramente indicativas ou resumos auxiliares de organização — o usuário médico é o único e integral responsável de modo exclusivo por toda decisão, conduta ou prescrição clínica em saúde.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">8. Limitação de responsabilidade civil</h2>
            <p>
              Por operarmos com ferramentas auxiliares digitais de uso voluntário, o Dr. Agent, seus desenvolvedores ou servidores em nuvem não se responsabilizam sob qualquer título civil/criminal por intercorrência clínica, condutas de saúde, erros profissionais cometidos pela equipe, exclusão indevida de dados por imperícia, ou ataques de engenharia social aplicados contra logins desprotegidos.
            </p>

            <h2 className="text-lg font-bold text-blue-950 uppercase tracking-wide pt-4 border-t border-slate-100">9. Resolução de conflitos e foro</h2>
            <p>
              Este acordo é regido e interpretado segundo as normativas da República Federativa do Brasil, elegendo-se o foro da Comarca judicial deste produto para mitigar eventuais lides jurídicas que não possam ser resolvidas administrativamente.
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
              href="/privacy"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Ver Política de Privacidade
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
