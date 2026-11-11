from functools import lru_cache

from ..repositories.event_repository import EventRepository
from ..services.analytics_service import AnalyticsService
from ..services.company_service import CompanyService
from ..services.financial_service import FinancialService
from ..services.graph_service import GraphService
from ..services.nlp_service import NlpService
from ..services.scraping_service import ScrapingService


@lru_cache
def get_repo() -> EventRepository:
    return EventRepository()


@lru_cache
def get_scraping() -> ScrapingService:
    return ScrapingService()


@lru_cache
def get_nlp() -> NlpService:
    return NlpService(get_repo())


def get_companies() -> CompanyService:
    return CompanyService(get_repo())


def get_financials() -> FinancialService:
    return FinancialService(get_companies())


def get_graph() -> GraphService:
    return GraphService(get_repo())


def get_analytics() -> AnalyticsService:
    return AnalyticsService(get_companies(), get_financials())
