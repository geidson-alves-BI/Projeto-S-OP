from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PersonaCode = Literal["SUPPLY", "CFO", "CEO", "COO"]


@dataclass(frozen=True)
class PersonaProfile:
    code: PersonaCode
    label: str
    tone: str
    focus: tuple[str, ...]
    goals: tuple[str, ...]
    guiding_questions: tuple[str, ...]


PERSONA_PROFILES: dict[PersonaCode, PersonaProfile] = {
    "SUPPLY": PersonaProfile(
        code="SUPPLY",
        label="Diretor Supply Chain",
        tone="objetivo, operacional e focado em risco de execucao",
        focus=(
            "ruptura de abastecimento",
            "excesso de estoque",
            "criticidade de materia-prima",
            "parametros de planejamento PP/ES",
            "pendencias de suprimento",
        ),
        goals=(
            "evitar ruptura em itens criticos",
            "reduzir excesso sem comprometer nivel de servico",
            "priorizar ajustes de curto prazo para estabilizar o plano",
        ),
        guiding_questions=(
            "Quais MPs criticas precisam de acao imediata de abastecimento?",
            "Quais SKUs exigem revisao de parametros PP/ES nesta semana?",
            "Existe risco simultaneo de ruptura e excesso no plano atual?",
        ),
    ),
    "CFO": PersonaProfile(
        code="CFO",
        label="CFO",
        tone="financeiro, pragmatismo de caixa e margem",
        focus=(
            "impacto financeiro total",
            "capital empatado em estoque",
            "custo de producao MTS",
            "eficiencia de alocacao de recursos",
            "trade-off custo x servico",
        ),
        goals=(
            "proteger margem operacional",
            "reduzir capital empatado sem perda relevante de servico",
            "direcionar acao para itens com maior impacto economico",
        ),
        guiding_questions=(
            "Onde esta o maior impacto financeiro de curto prazo?",
            "Quais decisoes reduzem custo sem aumentar risco operacional critico?",
            "Quais itens concentram maior necessidade de caixa no plano?",
        ),
    ),
    "CEO": PersonaProfile(
        code="CEO",
        label="CEO",
        tone="executivo, estrategico e orientado a decisao",
        focus=(
            "tres mensagens-chave para direcao executiva",
            "trade-offs entre crescimento, custo e servico",
            "prioridades de execucao 30-90 dias",
            "decisoes necessarias no comite",
        ),
        goals=(
            "sintetizar sinais criticos para decisao",
            "alinhar prioridades entre operacao e financeiro",
            "apontar riscos que afetam meta corporativa",
        ),
        guiding_questions=(
            "Quais sao as 3 prioridades executivas para os proximos 30 dias?",
            "Qual trade-off precisa de decisao imediata da diretoria?",
            "Qual risco pode comprometer crescimento ou servico no trimestre?",
        ),
    ),
    "COO": PersonaProfile(
        code="COO",
        label="COO",
        tone="operacional, integrado e orientado a estabilidade de execucao",
        focus=(
            "fluidez da operacao ponta a ponta",
            "capacidade de execucao",
            "gargalos entre demanda, producao e abastecimento",
            "trade-offs entre produtividade e servico",
            "disciplinas de curto prazo para estabilizacao",
        ),
        goals=(
            "preservar ritmo operacional com menor friccao",
            "priorizar acoes que reduzam risco de execucao",
            "alinhar planejamento, abastecimento e producao em torno da mesma prioridade",
        ),
        guiding_questions=(
            "Onde a operacao esta mais vulneravel a gargalos de execucao?",
            "Quais decisoes de curto prazo estabilizam fluxo e servico?",
            "Quais dependencias entre producao e suprimentos exigem alinhamento imediato?",
        ),
    ),
}


def get_persona_profile(persona: str) -> PersonaProfile:
    code = persona.strip().upper()
    if code not in PERSONA_PROFILES:
        allowed = ", ".join(PERSONA_PROFILES.keys())
        raise ValueError(f"Persona invalida: {persona}. Use uma das opcoes: {allowed}.")
    return PERSONA_PROFILES[code]  # type: ignore[return-value]
